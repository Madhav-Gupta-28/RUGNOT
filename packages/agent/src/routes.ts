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

const demoTokens: DemoToken[] = [
  {
    symbol: 'XPUMP',
    level: 'GO' as const,
    score: 82,
    price: 0.037,
    checks: [
      ['Contract Safety', true, 88, 'Contract checks passed'],
      ['Holder Analysis', true, 76, 'Top 10 holders: 24.0%'],
      ['Smart Money', true, 80, 'Smart money buying'],
      ['Liquidity', true, 84, '$100 swap impact: 1.60%'],
      ['Tx Simulation', true, 90, 'Simulation passed'],
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
      ['Liquidity', true, 55, '$100 swap impact: 4.50%'],
      ['Tx Simulation', true, 48, 'Simulation passed with warnings'],
    ],
  },
  {
    symbol: 'OKXAI',
    level: 'DANGER' as const,
    score: 8,
    price: 1.42,
    checks: [
      ['Contract Safety', false, 0, 'HONEYPOT DETECTED'],
      ['Holder Analysis', false, 18, 'Top 10 holders: 82.0%'],
      ['Smart Money', false, 12, 'Smart money SELLING'],
      ['Liquidity', false, 10, '$100 swap impact: 14.20%'],
      ['Tx Simulation', false, 0, 'Simulation FAILED: sell blocked'],
    ],
  },
];

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

export function createDemoRouter(state: StateStore): Router {
  const router = Router();

  router.post('/api/demo/trigger', (_req, res) => {
    const startedAt = Date.now();
    const tokenAddresses = demoTokens.map((token) => randomAddress(token.symbol));
    const goToken = demoTokens[0];
    const goAddress = tokenAddresses[0];
    const amountIn = 50;
    const amountOut = Math.round((amountIn / goToken.price) * 100) / 100;

    demoTokens.forEach((token, index) => {
      const verdict = makeVerdict(tokenAddresses[index], token.level, token.score, makeChecks(token.checks));
      state.addVerdict(verdict);
    });

    const buyTrade: TradeExecution = {
      id: uuidv4(),
      type: 'buy',
      tokenAddress: goAddress,
      tokenSymbol: goToken.symbol,
      amountIn,
      amountOut,
      txHash: randomAddress('tx-buy'),
      status: 'confirmed',
      verdict: state.get().recentVerdicts.find((verdict) => verdict.tokenAddress === goAddress),
      timestamp: Date.now(),
    };

    const position: Position = {
      tokenAddress: goAddress,
      tokenSymbol: goToken.symbol,
      amount: amountOut,
      entryPrice: goToken.price,
      currentPrice: goToken.price * 1.08,
      pnlPercent: 8,
      pnlUsd: 4,
      lastSecurityCheck: Date.now(),
      lastVerdictLevel: 'GO',
    };

    state.upsertPosition(position);
    state.setWalletBalance(Math.max(0, state.get().walletBalance - amountIn));
    state.addTrade(buyTrade);

    state.addX402Transaction({
      id: uuidv4(),
      direction: 'earned',
      amount: 0.005,
      service: 'security-check',
      timestamp: Date.now(),
    });
    state.addX402Transaction({
      id: uuidv4(),
      direction: 'spent',
      amount: 0.002,
      service: 'premium-signal-data',
      timestamp: Date.now(),
    });

    setTimeout(() => {
      const threat: ThreatAlert = {
        id: uuidv4(),
        tokenAddress: goAddress,
        tokenSymbol: goToken.symbol,
        threatType: 'whale-dump',
        severity: 'critical',
        description: 'Whale wallet dumped 18% of circulating supply into thin liquidity',
        action: 'alert-only',
        timestamp: Date.now(),
      };
      state.addThreat(threat);
    }, 5000);

    setTimeout(() => {
      const exitTrade: TradeExecution = {
        id: uuidv4(),
        type: 'sell',
        tokenAddress: goAddress,
        tokenSymbol: goToken.symbol,
        amountIn: amountOut,
        amountOut: 54,
        txHash: randomAddress('tx-exit'),
        status: 'confirmed',
        verdict: makeVerdict(goAddress, 'DANGER', 18, makeChecks([
          ['Contract Safety', true, 74, 'Contract unchanged'],
          ['Holder Analysis', false, 26, 'Whale concentration spiking'],
          ['Smart Money', false, 8, 'Smart money SELLING'],
          ['Liquidity', false, 16, '$100 swap impact: 12.40%'],
          ['Tx Simulation', true, 66, 'Emergency sell simulation passed'],
        ])),
        timestamp: Date.now(),
      };
      const exitAlert: ThreatAlert = {
        id: uuidv4(),
        tokenAddress: goAddress,
        tokenSymbol: goToken.symbol,
        threatType: 'whale-dump',
        severity: 'critical',
        description: 'Auto-exit fired after whale dump confirmation',
        action: 'auto-exit',
        exitTxHash: exitTrade.txHash,
        timestamp: Date.now(),
      };

      state.addVerdict(exitTrade.verdict!);
      state.removePosition(goAddress);
      state.setWalletBalance(state.get().walletBalance + exitTrade.amountOut);
      state.addTrade(exitTrade);
      state.addThreat(exitAlert);
      state.emitEvent({
        type: 'exit',
        data: { alert: exitAlert, trade: exitTrade },
        timestamp: Date.now(),
      });
      state.broadcastState();
    }, 8000);

    return res.json({
      ok: true,
      message: 'Demo cycle triggered',
      startedAt,
      tokens: demoTokens.map((token, index) => ({
        symbol: token.symbol,
        tokenAddress: tokenAddresses[index],
        level: token.level,
        score: token.score,
      })),
    });
  });

  return router;
}
