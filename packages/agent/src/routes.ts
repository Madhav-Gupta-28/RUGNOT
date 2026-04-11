import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

import type { StateStore } from './state.js';
import type { AgentConfig, EconomicsSnapshot, Position, SecurityCheck, ThreatAlert, TradeExecution, Verdict, VerdictLevel } from './types.js';

function buildChatReply(state: StateStore, message: string): string {
  const snapshot = state.get();
  const normalized = message.toLowerCase();

  if (normalized.includes('portfolio')) {
    return `Portfolio has ${snapshot.positions.length} open positions and wallet balance ${snapshot.walletBalance.toFixed(2)} USDT.`;
  }

  if (normalized.includes('threat')) {
    const latestThreat = snapshot.recentThreats[0];
    return latestThreat
      ? `Latest threat: ${latestThreat.tokenSymbol} ${latestThreat.threatType} (${latestThreat.severity}).`
      : 'No threats detected yet.';
  }

  if (normalized.includes('trade')) {
    const latestTrade = snapshot.recentTrades[0];
    return latestTrade
      ? `Latest trade was a ${latestTrade.type} on ${latestTrade.tokenSymbol} with status ${latestTrade.status}.`
      : 'No trades executed yet.';
  }

  return 'SentinelFi is monitoring X Layer and ready to discuss portfolio, threats, or recent trades.';
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

  router.post('/api/chat', (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    return res.json({ reply: buildChatReply(state, message) });
  });

  router.post('/api/settings', (req, res) => {
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
