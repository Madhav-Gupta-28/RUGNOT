import { Router } from 'express';

import type { StateStore } from './state.js';
import type { AgentConfig, EconomicsSnapshot } from './types.js';

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
