import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { buildChatReply } from './llm.js';
import { vetToken } from './guardian.js';
import type { StateStore } from './state.js';
import { executeOpportunity, executeSell } from './executor.js';
import {
  XLAYER_TOKENS,
  fetchTokenPrice,
  getMarketPriceInfo,
  getWalletStableBalances,
  verifyOkxCredentials,
} from './okx-api.js';
import { triggerAutoExit } from './auto-exit.js';
import type { AgentConfig, AgentStepEvent, EconomicsSnapshot, Position, SecurityCheck, ThreatAlert, TradeExecution, Verdict, VerdictLevel, VettedOpportunity } from './types.js';

// ---------------------------------------------------------------------------
// Public token scanner — free, no x402, rate-limited per IP.
// Powers the /scan page visible to anyone who visits the deployed app.
// ---------------------------------------------------------------------------

const publicScanRateMap = new Map<string, number>();
const PUBLIC_SCAN_COOLDOWN_MS = 5_000; // 1 request per 5s per IP
const MAINNET_DEMO_RUN_LABEL = 'judge-mainnet-cycle';

let mainnetDemoInFlight = false;
let lastMainnetDemoStartedAt = 0;

export function createPublicRouter(state: StateStore): Router {
  const router = Router();

  router.get('/api/public/scan', async (req: Request, res: Response) => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';

    const lastScan = publicScanRateMap.get(ip) ?? 0;
    const now = Date.now();
    const remaining = PUBLIC_SCAN_COOLDOWN_MS - (now - lastScan);

    if (remaining > 0) {
      return res.status(429).json({
        error: 'rate_limited',
        message: `Please wait ${Math.ceil(remaining / 1000)}s before scanning again.`,
        retryAfterMs: remaining,
      });
    }

    const tokenAddress = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return res.status(400).json({
        error: 'invalid_address',
        message: 'Provide a valid EVM token address via ?token=0x...',
      });
    }

    publicScanRateMap.set(ip, now);
    // Prune old entries to prevent memory leak (keep only last 1000 IPs)
    if (publicScanRateMap.size > 1000) {
      const oldest = [...publicScanRateMap.entries()].sort((a, b) => a[1] - b[1])[0];
      if (oldest) publicScanRateMap.delete(oldest[0]);
    }

    try {
      const verdict = await vetToken(tokenAddress);
      state.addVerdict(verdict);
      return res.json(verdict);
    } catch (error) {
      console.error('[Public Scan] Guardian failed:', error);
      return res.status(500).json({ error: 'scan_failed', message: 'Guardian scan failed. Try again.' });
    }
  });

  return router;
}



function sanitizeConfigUpdate(partial: Partial<AgentConfig>): Partial<AgentConfig> {
  const next: Partial<AgentConfig> = {};

  if (partial.riskTolerance === 'conservative' || partial.riskTolerance === 'moderate' || partial.riskTolerance === 'aggressive') {
    next.riskTolerance = partial.riskTolerance;
  }

  for (const key of ['scanIntervalMs', 'monitorIntervalMs', 'maxPositionSizeUsdt', 'maxPortfolioSizeUsdt'] as const) {
    const value = partial[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      next[key] = value;
    }
  }

  return next;
}

function isAdminAuthorized(req: Request): boolean {
  if (!env.adminToken) {
    return true;
  }

  const direct = req.header('x-admin-token');
  const auth = req.header('authorization');
  return direct === env.adminToken || auth === `Bearer ${env.adminToken}`;
}

function isMainnetDemoAuthorized(req: Request): boolean {
  return env.publicMainnetDemo || isAdminAuthorized(req);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampMainnetDemoAmount(requested?: unknown): number {
  const bodyAmount = typeof requested === 'number' ? requested : Number(requested);
  const configured = Number.isFinite(bodyAmount) && bodyAmount > 0 ? bodyAmount : env.mainnetDemoAmountUsdt;
  return Math.min(1, env.mainnetDemoAmountUsdt, Math.max(0.1, configured));
}

function emitAgentStep(state: StateStore, data: AgentStepEvent) {
  state.emitEvent({
    type: 'agent-step',
    data,
    timestamp: Date.now(),
  });
}

function isRealEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface MainnetDemoCandidate {
  tokenSymbol: string;
  tokenAddress: string;
}

interface MainnetDemoScanResult extends MainnetDemoCandidate {
  currentPrice: number;
  change24h: number;
  verdict: Verdict;
  accepted: boolean;
  reason: string;
}

interface MainnetDemoBoughtPosition extends MainnetDemoScanResult {
  trade: TradeExecution;
  beforeAmount: number;
  entryPrice: number;
}

const DEFAULT_MAINNET_DEMO_CANDIDATES: MainnetDemoCandidate[] = [
  { tokenSymbol: 'XDOG', tokenAddress: '0x0cc24c51bf89c00c5affbfcf5e856c25ecbdb48e' },
  { tokenSymbol: 'OEOE', tokenAddress: '0x4c225fb675c0c475b53381463782a7f741d59763' },
  { tokenSymbol: 'FDOG', tokenAddress: '0x5839244eab49314bccc0fa76e3a081cb1a461111' },
  { tokenSymbol: 'DOGSHIT', tokenAddress: '0x70bf3e2b75d8832d7f790a87fffc1fa9d63dc5bb' },
  { tokenSymbol: 'TITAN', tokenAddress: '0xfdc4a45a4bf53957b2c73b1ff323d8cbe39118dd' },
];

function parseCandidateString(raw: string): MainnetDemoCandidate[] {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [symbol, address] = item.split(/[:=]/).map((part) => part.trim());
      if (!symbol || !address || !isRealEvmAddress(address)) return null;
      return { tokenSymbol: symbol.toUpperCase(), tokenAddress: address.toLowerCase() };
    })
    .filter((item): item is MainnetDemoCandidate => Boolean(item));
}

function parseCandidateObjects(value: unknown): MainnetDemoCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const tokenSymbol = typeof record.tokenSymbol === 'string'
        ? record.tokenSymbol
        : typeof record.symbol === 'string'
          ? record.symbol
          : '';
      const tokenAddress = typeof record.tokenAddress === 'string'
        ? record.tokenAddress
        : typeof record.address === 'string'
          ? record.address
          : '';
      if (!tokenSymbol || !isRealEvmAddress(tokenAddress)) return null;
      return { tokenSymbol: tokenSymbol.toUpperCase(), tokenAddress: tokenAddress.toLowerCase() };
    })
    .filter((item): item is MainnetDemoCandidate => Boolean(item));
}

function uniqueCandidates(candidates: MainnetDemoCandidate[]): MainnetDemoCandidate[] {
  const seen = new Set<string>();
  const unique: MainnetDemoCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.tokenAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...candidate, tokenAddress: key });
  }
  return unique;
}

function getMainnetDemoCandidates(req: Request, allowOverride: boolean): MainnetDemoCandidate[] {
  const bodyCandidates = allowOverride
    ? parseCandidateObjects(req.body?.candidates)
    : [];
  const envCandidates = env.mainnetDemoCandidates
    ? parseCandidateString(env.mainnetDemoCandidates)
    : [];
  const fallback = env.mainnetDemoTokenAddress && env.mainnetDemoTokenSymbol && env.mainnetDemoTokenSymbol !== 'USDC'
    ? [{ tokenSymbol: env.mainnetDemoTokenSymbol, tokenAddress: env.mainnetDemoTokenAddress }]
    : DEFAULT_MAINNET_DEMO_CANDIDATES;

  return uniqueCandidates([
    ...bodyCandidates,
    ...(bodyCandidates.length > 0 ? [] : envCandidates),
    ...(bodyCandidates.length > 0 || envCandidates.length > 0 ? [] : fallback),
  ]).slice(0, 5);
}

function evaluateMainnetDemoSafety(verdict: Verdict): { ok: boolean; reason: string } {
  const contractSafety = verdict.checks.find((check) => check.name === 'Contract Safety');
  const simulation = verdict.checks.find((check) => check.name === 'Tx Simulation');
  const liquidity = verdict.checks.find((check) => check.name === 'Liquidity');

  for (const check of [contractSafety, liquidity, simulation]) {
    if (!check) {
      return { ok: false, reason: 'missing execution-layer check' };
    }
    const unavailable = check.reason.toLowerCase().includes('unavailable');
    if (unavailable || !check.passed || check.score <= 0) {
      return { ok: false, reason: `${check.name}: ${check.reason}` };
    }
  }

  if (verdict.level === 'DANGER' || verdict.score < 35) {
    return { ok: false, reason: `Guardian level ${verdict.level}, score ${verdict.score}` };
  }

  return { ok: true, reason: `execution layers passed; Guardian ${verdict.level} ${verdict.score}` };
}

async function runMainnetDemoLifecycle(state: StateStore, params: {
  runId: string;
  amountUsdt: number;
  candidates: MainnetDemoCandidate[];
  wasPaused: boolean;
}) {
  try {
    state.update({
      recentVerdicts: [],
      recentTrades: [],
      recentThreats: [],
    });
    state.broadcastState();

    emitAgentStep(state, {
      stage: 'DEMO',
      status: 'started',
      description: `Judge demo started: scanning ${params.candidates.length} lesser-known OKX X Layer tokens with a ${params.amountUsdt.toFixed(2)} USDT cap.`,
      runId: params.runId,
    });

    const scanResults: MainnetDemoScanResult[] = [];
    for (const candidate of params.candidates) {
      emitAgentStep(state, {
        stage: 'SCOUT',
        status: 'running',
        description: `Scanning ${candidate.tokenSymbol} from the OKX X Layer token list: liquidity, taxes, holder risk, and swap route.`,
        tokenAddress: candidate.tokenAddress,
        tokenSymbol: candidate.tokenSymbol,
        runId: params.runId,
      });

      const [price, marketInfo] = await Promise.all([
        fetchTokenPrice(candidate.tokenAddress).catch(() => null),
        getMarketPriceInfo([candidate.tokenAddress]).catch(() => []),
      ]);
      const currentPrice = (price
        ?? readNumber(marketInfo[0]?.price, 0))
        || 0;
      const change24h = readNumber(marketInfo[0]?.priceChange24H, 0);
      const verdict = await vetToken(candidate.tokenAddress);
      state.addVerdict(verdict);
      const safety = evaluateMainnetDemoSafety(verdict);
      const result: MainnetDemoScanResult = {
        ...candidate,
        currentPrice,
        change24h,
        verdict,
        accepted: safety.ok,
        reason: safety.reason,
      };
      scanResults.push(result);

      emitAgentStep(state, {
        stage: 'GUARDIAN',
        status: safety.ok ? 'passed' : 'blocked',
        description: `${candidate.tokenSymbol}: ${verdict.level} ${verdict.score}. ${safety.reason}. 24h ${change24h.toFixed(2)}%.`,
        tokenAddress: candidate.tokenAddress,
        tokenSymbol: candidate.tokenSymbol,
        runId: params.runId,
      });

      await sleep(900);
    }

    const accepted = scanResults.filter((result) => result.accepted);
    if (accepted.length === 0) {
      throw new Error('Guardian blocked every curated X Layer demo token. No mainnet buys were sent.');
    }

    const desiredBuyCount = Math.max(
      1,
      Math.min(
        env.mainnetDemoBuyCount,
        accepted.length,
        Math.max(1, Math.floor(params.amountUsdt / 0.1)),
      ),
    );
    const strongest = [...accepted].sort((a, b) => b.verdict.score - a.verdict.score)[0];
    const downtrendProbe = [...accepted]
      .filter((result) => result.tokenAddress !== strongest.tokenAddress)
      .sort((a, b) => a.change24h - b.change24h)[0];
    const selected = uniqueCandidates([
      strongest,
      ...(downtrendProbe ? [downtrendProbe] : []),
      ...[...accepted].sort((a, b) => b.verdict.score - a.verdict.score),
    ]).map((candidate) => accepted.find((result) => result.tokenAddress === candidate.tokenAddress))
      .filter((result): result is MainnetDemoScanResult => Boolean(result))
      .slice(0, accepted.length);
    const amountPerBuy = Math.max(0.1, params.amountUsdt / desiredBuyCount);
    const bought: MainnetDemoBoughtPosition[] = [];

    emitAgentStep(state, {
      stage: 'EXECUTOR',
      status: 'running',
      description: `Selected ${selected.map((item) => item.tokenSymbol).join(' + ')}. Buying up to ${desiredBuyCount} token(s) at ${amountPerBuy.toFixed(2)} USDT each so the portfolio page shows real positions.`,
      runId: params.runId,
    });

    for (const candidate of selected) {
      if (bought.length >= desiredBuyCount) {
        break;
      }

      const beforePosition = state.get().positions.find((position) => (
        position.tokenAddress.toLowerCase() === candidate.tokenAddress.toLowerCase()
      ));
      const beforeAmount = beforePosition?.amount ?? 0;
      const opportunity: VettedOpportunity = {
        tokenAddress: candidate.tokenAddress,
        tokenSymbol: candidate.tokenSymbol,
        signalType: 'volume-spike',
        signalStrength: Math.max(70, candidate.verdict.score),
        currentPrice: candidate.currentPrice || 1,
        verdict: candidate.verdict,
      };

      const buyTrade = await executeOpportunity(opportunity, state, amountPerBuy);
      if (!buyTrade || (buyTrade.status !== 'confirmed' && buyTrade.status !== 'pending')) {
        emitAgentStep(state, {
          stage: 'EXECUTOR',
          status: 'failed',
          description: `${candidate.tokenSymbol} buy did not confirm; continuing demo with remaining candidates.`,
          tokenAddress: candidate.tokenAddress,
          tokenSymbol: candidate.tokenSymbol,
          runId: params.runId,
        });
        continue;
      }

      bought.push({
        ...candidate,
        trade: buyTrade,
        beforeAmount,
        entryPrice: candidate.currentPrice || (buyTrade.amountIn / Math.max(buyTrade.amountOut, 0.000001)),
      });
      emitAgentStep(state, {
        stage: 'EXECUTOR',
        status: 'executed',
        description: `${buyTrade.status === 'confirmed' ? 'Bought' : 'Broadcast'} ${candidate.tokenSymbol} with ${amountPerBuy.toFixed(2)} USDT through OKX DEX Aggregator v6.`,
        tokenAddress: candidate.tokenAddress,
        tokenSymbol: candidate.tokenSymbol,
        txHash: buyTrade.txHash,
        runId: params.runId,
      });
      await sleep(5_000);
    }

    if (bought.length === 0) {
      throw new Error('No curated X Layer token buy confirmed. Check OKX route/allowance/gas logs.');
    }

    emitAgentStep(state, {
      stage: 'SENTINEL',
      status: 'running',
      description: `Monitoring ${bought.map((item) => item.tokenSymbol).join(' + ')} for ${Math.round(env.mainnetDemoMonitorMs / 1000)}s. Only the token that trips risk will be sold.`,
      runId: params.runId,
    });

    const sold = new Set<string>();
    const rounds = Math.max(3, Math.min(5, Math.round(env.mainnetDemoMonitorMs / 25_000)));
    const roundDelayMs = Math.max(15_000, Math.floor(env.mainnetDemoMonitorMs / rounds));

    for (let round = 1; round <= rounds; round += 1) {
      await sleep(roundDelayMs);
      for (const item of bought) {
        if (sold.has(item.tokenAddress)) continue;
        const livePosition = state.get().positions.find((position) => (
          position.tokenAddress.toLowerCase() === item.tokenAddress.toLowerCase()
        ));
        if (!livePosition) continue;

        const [latestPrice, marketInfo] = await Promise.all([
          fetchTokenPrice(item.tokenAddress).catch(() => null),
          getMarketPriceInfo([item.tokenAddress]).catch(() => []),
        ]);
        const currentPrice = (latestPrice
          ?? readNumber(marketInfo[0]?.price, livePosition.currentPrice))
          || livePosition.currentPrice;
        const pnlPercent = item.entryPrice > 0
          ? ((currentPrice - item.entryPrice) / item.entryPrice) * 100
          : 0;
        const change24h = readNumber(marketInfo[0]?.priceChange24H, item.change24h);
        state.upsertPosition({
          ...livePosition,
          currentPrice,
          pnlPercent,
          pnlUsd: (currentPrice - livePosition.entryPrice) * livePosition.amount,
        });

        const liveDrawdown = pnlPercent <= -0.15;
        const downtrendExit = round >= 2 && change24h <= -3;
        const shouldExit = sold.size === 0 && (liveDrawdown || downtrendExit);
        emitAgentStep(state, {
          stage: 'SENTINEL',
          status: shouldExit ? 'blocked' : 'running',
          description: shouldExit
            ? `${item.tokenSymbol} risk tripped: entry PnL ${pnlPercent.toFixed(2)}%, 24h ${change24h.toFixed(2)}%. Selling only this token.`
            : `${item.tokenSymbol} hold: entry PnL ${pnlPercent.toFixed(2)}%, 24h ${change24h.toFixed(2)}%, Guardian route still monitored.`,
          tokenAddress: item.tokenAddress,
          tokenSymbol: item.tokenSymbol,
          runId: params.runId,
        });

        if (!shouldExit) continue;

        const currentPosition = state.get().positions.find((position) => (
          position.tokenAddress.toLowerCase() === item.tokenAddress.toLowerCase()
        ));
        if (!currentPosition) continue;
        const demoAmount = Math.max(0, currentPosition.amount - item.beforeAmount);
        if (demoAmount <= 0) continue;

        const exitVerdict = await vetToken(item.tokenAddress, 'exit');
        state.addVerdict(exitVerdict);
        const alert: ThreatAlert = {
          id: uuidv4(),
          tokenAddress: item.tokenAddress,
          tokenSymbol: item.tokenSymbol,
          threatType: 'price-crash',
          severity: liveDrawdown ? 'high' : 'medium',
          description: `${item.tokenSymbol} crossed Sentinel demo exit rule: entry PnL ${pnlPercent.toFixed(2)}%, 24h ${change24h.toFixed(2)}%.`,
          action: 'auto-exit',
          timestamp: Date.now(),
        };
        const exitResult = await triggerAutoExit(state, currentPosition, alert, exitVerdict, demoAmount);
        state.addThreat(exitResult.alert);
        if (exitResult.trade.status === 'confirmed') {
          sold.add(item.tokenAddress);
          emitAgentStep(state, {
            stage: 'AUTO_EXIT',
            status: 'executed',
            description: `Sold ${item.tokenSymbol} only. Remaining demo positions stay visible for portfolio and Sentinel views.`,
            tokenAddress: item.tokenAddress,
            tokenSymbol: item.tokenSymbol,
            txHash: exitResult.trade.txHash,
            runId: params.runId,
          });
        } else {
          emitAgentStep(state, {
            stage: 'AUTO_EXIT',
            status: 'failed',
            description: `${item.tokenSymbol} exit did not confirm. Position remains visible for manual sell.`,
            tokenAddress: item.tokenAddress,
            tokenSymbol: item.tokenSymbol,
            txHash: exitResult.trade.txHash,
            runId: params.runId,
          });
        }
      }
    }

    emitAgentStep(state, {
      stage: 'DEMO',
      status: 'complete',
      description: `Mainnet demo complete: scanned ${scanResults.length}, bought ${bought.length}, sold ${sold.size}. Unsold positions remain open for portfolio review.`,
      runId: params.runId,
    });
  } catch (error) {
    emitAgentStep(state, {
      stage: 'DEMO',
      status: 'failed',
      description: error instanceof Error ? error.message : 'Mainnet demo cycle failed.',
      runId: params.runId,
    });
  } finally {
    state.setPaused(params.wasPaused);
    mainnetDemoInFlight = false;
    state.broadcastState();
  }
}

export function createApiRouter(state: StateStore): Router {
  const router = Router();

  router.get('/api/state', (_req, res) => {
    res.json(state.get());
  });

  router.get('/api/portfolio', (_req, res) => {
    const snapshot = state.get();
    const positions = snapshot.positions.map((position) => ({
      ...position,
      latestVerdict: snapshot.recentVerdicts.find((verdict) => verdict.tokenAddress === position.tokenAddress) ?? null,
    }));

    res.json(positions);
  });

  router.get('/api/verdicts', (_req, res) => {
    res.json(state.get().recentVerdicts);
  });

  router.get('/api/threats', (_req, res) => {
    res.json(state.get().recentThreats);
  });

  router.get('/api/economics', (_req, res) => {
    const snapshot = state.get();
    const economics: EconomicsSnapshot = {
      transactions: snapshot.x402Transactions,
      totalEarned: snapshot.x402TotalEarned,
      totalSpent: snapshot.x402TotalSpent,
      netRevenue: snapshot.x402TotalEarned - snapshot.x402TotalSpent,
    };

    res.json(economics);
  });

  router.post('/api/chat', async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    return res.json({ reply: await buildChatReply(state, message) });
  });

  router.post('/api/pause', (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'admin token required' });
    }

    state.setPaused(true);
    return res.json({ ok: true, isPaused: true });
  });

  router.post('/api/resume', (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'admin token required' });
    }

    state.setPaused(false);
    return res.json({ ok: true, isPaused: false });
  });

  router.post('/api/settings', (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'admin token required' });
    }

    const updates = sanitizeConfigUpdate(req.body ?? {});
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    const nextConfig = {
      ...state.get().config,
      ...updates,
    };
    state.update({ config: nextConfig });
    state.broadcastState();

    return res.json(nextConfig);
  });

  router.post('/api/demo/mainnet-cycle', async (req, res) => {
    if (!env.mainnetDemoEnabled) {
      return res.status(403).json({
        error: 'mainnet_demo_disabled',
        message: 'Set MAINNET_DEMO_ENABLED=true to allow the real X Layer lifecycle demo.',
      });
    }

    if (!isMainnetDemoAuthorized(req)) {
      return res.status(401).json({ error: 'admin token required' });
    }

    if (mainnetDemoInFlight) {
      return res.status(409).json({
        error: 'demo_in_flight',
        message: 'A mainnet demo cycle is already running.',
      });
    }

    const cooldownRemaining = env.mainnetDemoCooldownMs - (Date.now() - lastMainnetDemoStartedAt);
    if (cooldownRemaining > 0 && !isAdminAuthorized(req)) {
      return res.status(429).json({
        error: 'demo_cooldown',
        retryAfterMs: cooldownRemaining,
        message: `Mainnet demo is cooling down for ${Math.ceil(cooldownRemaining / 1000)}s.`,
      });
    }

    if (!env.okxCredentialsConfigured || !env.privateKey) {
      return res.status(409).json({
        error: 'live_mode_not_configured',
        message: 'Real mainnet demo needs OKX API keys and PRIVATE_KEY.',
      });
    }

    const credentialsOk = await verifyOkxCredentials();
    if (!credentialsOk) {
      return res.status(409).json({
        error: 'okx_credentials_invalid',
        message: 'OKX API credentials could not be validated.',
      });
    }

    const amountUsdt = clampMainnetDemoAmount(req.body?.amountUsdt);
    const balances = await getWalletStableBalances(state.get().walletAddress);
    state.setWalletBalance(balances.totalUsdt);

    if (balances.okb <= 0 || balances.totalUsdt < amountUsdt) {
      return res.status(409).json({
        error: 'insufficient_demo_funds',
        message: `Need OKB gas and at least ${amountUsdt.toFixed(2)} total USDT on X Layer.`,
        balances,
      });
    }

    const candidates = getMainnetDemoCandidates(req, !env.publicMainnetDemo && isAdminAuthorized(req));
    if (candidates.length === 0) {
      return res.status(400).json({
        error: 'no_demo_candidates',
        message: 'No valid X Layer demo candidates configured.',
      });
    }

    const runId = `${MAINNET_DEMO_RUN_LABEL}-${Date.now().toString(36)}`;
    const wasPaused = state.get().isPaused;
    mainnetDemoInFlight = true;
    lastMainnetDemoStartedAt = Date.now();
    state.setPaused(true);

    void runMainnetDemoLifecycle(state, {
      runId,
      amountUsdt,
      candidates,
      wasPaused,
    });

    return res.status(202).json({
      ok: true,
      mode: 'real-mainnet',
      runId,
      amountUsdt,
      candidates,
      estimatedDurationMs: env.mainnetDemoMonitorMs + 120_000,
      message: 'Real X Layer demo started: scanning curated tokens, buying safe candidates, then Sentinel monitors for selective exits.',
    });
  });

  router.post('/api/positions/:token/sell', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'admin token required' });
    }

    const { token } = req.params;
    const position = state.get().positions.find((p) => p.tokenAddress.toLowerCase() === token.toLowerCase());
    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    try {
      const trade = await executeSell(position, state);
      return res.json({ ok: true, trade });
    } catch (error) {
      console.error(`[API] Manual sell failed for ${token}:`, error);
      return res.status(500).json({ error: 'Sell execution failed' });
    }
  });

  router.post('/api/positions/sell-all', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'admin token required' });
    }

    const positions = [...state.get().positions];
    const results = [];

    for (const position of positions) {
      try {
        const trade = await executeSell(position, state);
        results.push({ tokenAddress: position.tokenAddress, symbol: position.tokenSymbol, status: trade.status, trade });
      } catch (error) {
        console.error(`[API] Manual sell failed for ${position.tokenAddress}:`, error);
        results.push({ tokenAddress: position.tokenAddress, symbol: position.tokenSymbol, status: 'error' });
      }
    }

    return res.json({ ok: true, results });
  });

  return router;
}

interface DemoToken {
  symbol: string;
  level: VerdictLevel;
  score: number;
  price: number;
  checks: Array<[string, boolean, number, string]>;
}



// Realistic fake tx hash — 64 hex chars like a real EVM tx
// ---------------------------------------------------------------------------
function randomAddress(seed: string): string {
  const hex = Buffer.from(`${seed}-${Date.now()}-${Math.random()}`).toString('hex');
  return `0x${hex.padEnd(40, '0').slice(0, 40)}`;
}

function makeChecks(rows: Array<[string, boolean, number, string]>): SecurityCheck[] {
  return rows.map(([name, passed, score, reason]) => ({ name, passed, score, reason }));
}

function makeVerdict(tokenAddress: string, level: VerdictLevel, score: number, checks: SecurityCheck[]): Verdict {
  return {
    tokenAddress,
    chain: 'xlayer',
    level,
    score,
    checks,
    timestamp: Date.now(),
    executionTimeMs: 420 + Math.floor(Math.random() * 900),
  };
}

const demoTokens: DemoToken[] = [
  {
    symbol: 'XPUMP',
    level: 'GO' as const,
    score: 82,
    price: 0.037,
    checks: [
      ['Contract Safety', true, 88, 'No honeypot, tax: 0%'],
      ['Holder Analysis', true, 76, 'Top 10 holders: 24.1%'],
      ['Smart Money', true, 80, 'Net smart-money inflow: +$1,240'],
      ['Liquidity', true, 84, '$50 swap impact: 1.6%'],
      ['Tx Simulation', true, 90, 'Buy + sell simulation passed'],
    ],
  },
  {
    symbol: 'LAYERFI',
    level: 'GO' as const,
    score: 76,
    price: 0.0021,
    checks: [
      ['Contract Safety', true, 82, 'Verified contract, renounced ownership'],
      ['Holder Analysis', true, 71, 'Top 10 holders: 31.4%'],
      ['Smart Money', true, 74, 'KOL buying detected'],
      ['Liquidity', true, 78, '$50 swap impact: 2.1%'],
      ['Tx Simulation', true, 76, 'Simulation passed'],
    ],
  },
  {
    symbol: 'LAYERDOG',
    level: 'CAUTION' as const,
    score: 45,
    price: 0.0048,
    checks: [
      ['Contract Safety', true, 62, 'Proxy contract detected'],
      ['Holder Analysis', false, 34, 'Top 10 holders: 66.0%'],
      ['Smart Money', false, 28, 'Smart money SELLING'],
      ['Liquidity', true, 55, '$50 swap impact: 4.5%'],
      ['Tx Simulation', true, 48, 'Simulation passed with warnings'],
    ],
  },
  {
    symbol: 'OKXAI',
    level: 'DANGER' as const,
    score: 8,
    price: 1.42,
    checks: [
      ['Contract Safety', false, 0, 'HONEYPOT DETECTED — sell disabled'],
      ['Holder Analysis', false, 18, 'Top 10 holders: 82.0%'],
      ['Smart Money', false, 12, 'Smart money SELLING'],
      ['Liquidity', false, 10, '$50 swap impact: 14.2%'],
      ['Tx Simulation', false, 0, 'Simulation FAILED'],
    ],
  },
];

export function createDemoRouter(state: StateStore): Router {
  const router = Router();

  router.post('/api/demo/trigger', (_req, res) => {
    const startedAt = Date.now();
    const TOTAL_DEMO_MS = 120_000; // 2 minutes

    // Generate addresses
    const tokenAddresses = demoTokens.map((t) => randomAddress(t.symbol));
    const [goToken1, goToken2, cautionToken, dangerToken] = demoTokens;
    const [addr1, addr2, addr3, addr4] = tokenAddresses;

    // t=0 — Scout scans 4 tokens, Guardian runs verdicts
    demoTokens.forEach((token, i) => {
      setTimeout(() => {
        state.addVerdict(makeVerdict(tokenAddresses[i], token.level, token.score, makeChecks(token.checks)));
      }, i * 800); // stagger so feed shows them arriving one by one
    });

    // t=3s — Buy XPUMP (GO, score 82)
    setTimeout(() => {
      const amountIn1 = 1;
      const amountOut1 = Math.round((amountIn1 / goToken1.price) * 100) / 100;
      const txHash1 = undefined;

      const buyTrade1: TradeExecution = {
        id: uuidv4(), type: 'buy',
        tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        amountIn: amountIn1, amountOut: amountOut1,
        txHash: txHash1, status: 'confirmed',
        verdict: state.get().recentVerdicts.find((v) => v.tokenAddress === addr1),
        timestamp: Date.now(),
      };
      const pos1: Position = {
        tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        amount: amountOut1,
        entryPrice: goToken1.price,
        currentPrice: goToken1.price * 1.04, // already up 4%
        pnlPercent: 4, pnlUsd: amountIn1 * 0.04,
        lastSecurityCheck: Date.now(), lastVerdictLevel: 'GO',
      };
      state.upsertPosition(pos1);
      state.setWalletBalance(Math.max(0, state.get().walletBalance - amountIn1));
      state.addTrade(buyTrade1);

      state.addX402Transaction({
        id: uuidv4(), direction: 'earned', amount: 0.005,
        service: 'security-check:base', timestamp: Date.now(),
      });
    }, 3_000);

    // t=7s — Buy LAYERFI (GO, score 76)
    setTimeout(() => {
      const amountIn2 = 1;
      const amountOut2 = Math.round((amountIn2 / goToken2.price) * 100) / 100;
      const txHash2 = undefined;

      const buyTrade2: TradeExecution = {
        id: uuidv4(), type: 'buy',
        tokenAddress: addr2, tokenSymbol: goToken2.symbol,
        amountIn: amountIn2, amountOut: amountOut2,
        txHash: txHash2, status: 'confirmed',
        verdict: state.get().recentVerdicts.find((v) => v.tokenAddress === addr2),
        timestamp: Date.now(),
      };
      const pos2: Position = {
        tokenAddress: addr2, tokenSymbol: goToken2.symbol,
        amount: amountOut2,
        entryPrice: goToken2.price,
        currentPrice: goToken2.price * 1.06,
        pnlPercent: 6, pnlUsd: amountIn2 * 0.06,
        lastSecurityCheck: Date.now(), lastVerdictLevel: 'GO',
      };
      state.upsertPosition(pos2);
      state.setWalletBalance(Math.max(0, state.get().walletBalance - amountIn2));
      state.addTrade(buyTrade2);

      state.addX402Transaction({
        id: uuidv4(), direction: 'earned', amount: 0.005,
        service: 'security-check:base', timestamp: Date.now(),
      });
    }, 7_000);

    // t=20s — Sentinel re-checks XPUMP, price drifts up +12%
    setTimeout(() => {
      state.upsertPosition({
        tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        amount: Math.round((1 / goToken1.price) * 100) / 100,
        entryPrice: goToken1.price,
        currentPrice: goToken1.price * 1.12,
        pnlPercent: 12, pnlUsd: 1 * 0.12,
        lastSecurityCheck: Date.now(), lastVerdictLevel: 'GO',
      });
      state.addVerdict(makeVerdict(addr1, 'GO', 79, makeChecks([
        ['Contract Safety', true, 88, 'Contract unchanged'],
        ['Holder Analysis', true, 72, 'Holder distribution healthy'],
        ['Smart Money', true, 77, 'Smart money still holding'],
        ['Liquidity', true, 80, '$50 swap impact: 1.8%'],
        ['Tx Simulation', true, 88, 'Re-check simulation passed'],
      ])));
    }, 20_000);

    // t=35s — Sentinel re-checks LAYERFI, price up +9%
    setTimeout(() => {
      state.upsertPosition({
        tokenAddress: addr2, tokenSymbol: goToken2.symbol,
        amount: Math.round((1 / goToken2.price) * 100) / 100,
        entryPrice: goToken2.price,
        currentPrice: goToken2.price * 1.09,
        pnlPercent: 9, pnlUsd: 1 * 0.09,
        lastSecurityCheck: Date.now(), lastVerdictLevel: 'GO',
      });
    }, 35_000);

    // t=55s — XPUMP threat: whale dump detected
    setTimeout(() => {
      const threat1: ThreatAlert = {
        id: uuidv4(), tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        threatType: 'whale-dump', severity: 'critical',
        description: 'Whale wallet sold 18% of circulating supply — liquidity dropping fast',
        action: 'alert-only', timestamp: Date.now(),
      };
      state.addThreat(threat1);

      // Price nukes
      state.upsertPosition({
        tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        amount: Math.round((1 / goToken1.price) * 100) / 100,
        entryPrice: goToken1.price,
        currentPrice: goToken1.price * 0.72, // -28%
        pnlPercent: -28, pnlUsd: -0.28,
        lastSecurityCheck: Date.now(), lastVerdictLevel: 'CAUTION',
      });
    }, 55_000);

    // t=70s — Sentinel triggers auto-exit on XPUMP (DANGER verdict)
    setTimeout(() => {
      const exitVerdict = makeVerdict(addr1, 'DANGER', 17, makeChecks([
        ['Contract Safety', true, 74, 'Contract unchanged'],
        ['Holder Analysis', false, 22, 'Whale concentration 71% — extreme'],
        ['Smart Money', false, 6, 'Smart money fully exited'],
        ['Liquidity', false, 14, '$50 swap impact: 18.4%'],
        ['Tx Simulation', true, 62, 'Emergency sell simulation passed'],
      ]));
      const exitTx1 = undefined;
      const exitTrade1: TradeExecution = {
        id: uuidv4(), type: 'sell',
        tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        amountIn: Math.round((1 / goToken1.price) * 100) / 100,
        amountOut: 0.78, // exited at loss but saved capital
        txHash: exitTx1, status: 'confirmed',
        verdict: exitVerdict, timestamp: Date.now(),
      };
      const exitAlert1: ThreatAlert = {
        id: uuidv4(), tokenAddress: addr1, tokenSymbol: goToken1.symbol,
        threatType: 'whale-dump', severity: 'critical',
        description: 'Sentinel auto-exit fired — position closed, $0.22 loss prevented further bleed',
        action: 'auto-exit', exitTxHash: exitTx1, timestamp: Date.now(),
      };

      state.addVerdict(exitVerdict);
      state.removePosition(addr1);
      state.setWalletBalance(state.get().walletBalance + exitTrade1.amountOut);
      state.addTrade(exitTrade1);
      state.addThreat(exitAlert1);
      state.emitEvent({ type: 'exit', data: { alert: exitAlert1, trade: exitTrade1 }, timestamp: Date.now() });
      state.broadcastState();
    }, 70_000);

    // t=90s — LAYERFI continues to hold well; Sentinel gives green re-check
    setTimeout(() => {
      state.upsertPosition({
        tokenAddress: addr2, tokenSymbol: goToken2.symbol,
        amount: Math.round((1 / goToken2.price) * 100) / 100,
        entryPrice: goToken2.price,
        currentPrice: goToken2.price * 1.14,
        pnlPercent: 14, pnlUsd: 0.14,
        lastSecurityCheck: Date.now(), lastVerdictLevel: 'GO',
      });
      state.addVerdict(makeVerdict(addr2, 'GO', 81, makeChecks([
        ['Contract Safety', true, 90, 'Contract unchanged'],
        ['Holder Analysis', true, 74, 'Distribution improving'],
        ['Smart Money', true, 82, 'Smart money adding'],
        ['Liquidity', true, 83, '$50 swap impact: 1.9%'],
        ['Tx Simulation', true, 87, 'Simulation passed'],
      ])));
    }, 90_000);

    // t=108s — Exit LAYERFI for profit
    setTimeout(() => {
      const exitTx2 = undefined;
      const exitTrade2: TradeExecution = {
        id: uuidv4(), type: 'sell',
        tokenAddress: addr2, tokenSymbol: goToken2.symbol,
        amountIn: Math.round((1 / goToken2.price) * 100) / 100,
        amountOut: 1.14,
        txHash: exitTx2, status: 'confirmed',
        timestamp: Date.now(),
      };
      const profitAlert: ThreatAlert = {
        id: uuidv4(), tokenAddress: addr2, tokenSymbol: goToken2.symbol,
        threatType: 'price-crash', severity: 'medium',
        description: 'Profit target reached (+14%). Sentinel locked in gains.',
        action: 'auto-exit', exitTxHash: exitTx2, timestamp: Date.now(),
      };

      state.removePosition(addr2);
      state.setWalletBalance(state.get().walletBalance + exitTrade2.amountOut);
      state.addTrade(exitTrade2);
      state.addThreat(profitAlert);
      state.emitEvent({ type: 'exit', data: { alert: profitAlert, trade: exitTrade2 }, timestamp: Date.now() });

      state.addX402Transaction({
        id: uuidv4(), direction: 'earned', amount: 0.005,
        service: 'security-check:base', timestamp: Date.now(),
      });
      state.broadcastState();
    }, 108_000);

    return res.json({
      ok: true,
      message: 'Demo cycle triggered (2-minute lifecycle)',
      durationMs: TOTAL_DEMO_MS,
      startedAt,
      tokens: demoTokens.map((t, i) => ({
        symbol: t.symbol, tokenAddress: tokenAddresses[i],
        level: t.level, score: t.score,
      })),
    });
  });

  return router;
}
