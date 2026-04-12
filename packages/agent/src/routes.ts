import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { buildChatReply } from './llm.js';
import { vetToken } from './guardian.js';
import type { StateStore } from './state.js';
import { executeSell } from './executor.js';
import type { AgentConfig, EconomicsSnapshot, Position, SecurityCheck, ThreatAlert, TradeExecution, Verdict, VerdictLevel } from './types.js';

// ---------------------------------------------------------------------------
// Public token scanner — free, no x402, rate-limited per IP.
// Powers the /scan page visible to anyone who visits the deployed app.
// ---------------------------------------------------------------------------

const publicScanRateMap = new Map<string, number>();
const PUBLIC_SCAN_COOLDOWN_MS = 5_000; // 1 request per 5s per IP

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
function fakeTxHash(seed: string): string {
  const base = Buffer.from(`${seed}-${Date.now()}-${Math.random()}`).toString('hex');
  return `0x${base.repeat(4).slice(0, 64)}`;
}

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
      const txHash1 = fakeTxHash('buy-xpump');

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
      const txHash2 = fakeTxHash('buy-layerfi');

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
      const exitTx1 = fakeTxHash('sell-xpump');
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
      const exitTx2 = fakeTxHash('sell-layerfi-profit');
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

