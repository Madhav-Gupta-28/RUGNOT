import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import { callOkxApi, fetchTokenPrice } from './okx-api.js';
import { triggerAutoExit } from './auto-exit.js';
import { refreshPositionMark } from './executor.js';
import type { StateStore } from './state.js';
import type { Position, ThreatAlert, Verdict } from './types.js';

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function severityRank(severity: ThreatAlert['severity']): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'high':
      return 2;
    default:
      return 1;
  }
}

function autoExitThreshold(riskTolerance: 'conservative' | 'moderate' | 'aggressive'): ThreatAlert['severity'] {
  switch (riskTolerance) {
    case 'conservative':
      return 'medium';
    case 'aggressive':
      return 'critical';
    default:
      return 'high';
  }
}

function shouldAutoExit(state: StateStore, alert: ThreatAlert): boolean {
  return severityRank(alert.severity) >= severityRank(autoExitThreshold(state.get().config.riskTolerance));
}

async function fetchLiquidityImpact(tokenAddress: string, amount: number): Promise<number | null> {
  const quote = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/swap/quote?chainId=${env.agentChainId}&fromTokenAddress=${tokenAddress}&toTokenAddress=USDT&amount=${Math.max(1, Math.round(amount * 1_000_000))}`,
  );

  if (!quote) {
    return null;
  }

  const impact = readNumber(quote.priceImpact, NaN);
  return Number.isFinite(impact) ? impact : null;
}

async function fetchSmartMoneyNet(tokenAddress: string): Promise<number> {
  const flow = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/signal/smart-money?chainId=${env.agentChainId}&tokenAddress=${tokenAddress}`,
  );

  return readNumber(flow?.netBuyAmount, 0);
}

function buildThreats(position: Position, verdict: Verdict, liquidityImpact: number | null, smartMoneyNet: number): ThreatAlert[] {
  const alerts: ThreatAlert[] = [];

  if (smartMoneyNet < 0) {
    alerts.push({
      id: uuidv4(),
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      threatType: 'whale-dump',
      severity: smartMoneyNet < -10_000 ? 'critical' : 'high',
      description: smartMoneyNet < -10_000 ? 'Aggressive smart-money selling detected' : 'Smart money has turned net negative',
      action: smartMoneyNet < -10_000 ? 'auto-exit' : 'alert-only',
      timestamp: Date.now(),
    });
  }

  if (position.pnlPercent <= -12) {
    alerts.push({
      id: uuidv4(),
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      threatType: 'price-crash',
      severity: position.pnlPercent <= -25 ? 'critical' : 'high',
      description: `Price drawdown reached ${position.pnlPercent.toFixed(2)}%`,
      action: position.pnlPercent <= -25 ? 'auto-exit' : 'alert-only',
      timestamp: Date.now(),
    });
  }

  if (liquidityImpact !== null && liquidityImpact >= 7) {
    alerts.push({
      id: uuidv4(),
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      threatType: 'liquidity-pull',
      severity: liquidityImpact >= 15 ? 'critical' : 'high',
      description: `Exit quote impact widened to ${liquidityImpact.toFixed(2)}%`,
      action: liquidityImpact >= 15 ? 'auto-exit' : 'alert-only',
      timestamp: Date.now(),
    });
  }

  const contractSafety = verdict.checks.find((check) => check.name === 'Contract Safety');
  if (verdict.level === 'DANGER' || (contractSafety?.score ?? 100) <= 30) {
    alerts.push({
      id: uuidv4(),
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      threatType: 'contract-change',
      severity: verdict.level === 'DANGER' ? 'critical' : 'high',
      description: verdict.level === 'DANGER' ? 'Guardian downgraded token to DANGER' : 'Contract safety degraded materially',
      action: 'auto-exit',
      timestamp: Date.now(),
    });
  }

  return alerts;
}

export async function runSentinelCycle(state: StateStore): Promise<ThreatAlert[]> {
  const snapshot = state.get();
  const soldTokenAddresses = new Set<string>();
  const nextPositions: Position[] = [];
  const alerts: ThreatAlert[] = [];

  for (const position of snapshot.positions) {
    const currentPrice = await fetchTokenPrice(position.tokenAddress) ?? position.currentPrice;
    const marked = refreshPositionMark(position, currentPrice);
    const verdict = await vetToken(position.tokenAddress);
    state.addVerdict(verdict);

    const updatedPosition: Position = {
      ...marked,
      lastSecurityCheck: Date.now(),
      lastVerdictLevel: verdict.level,
    };

    const [liquidityImpact, smartMoneyNet] = await Promise.all([
      fetchLiquidityImpact(position.tokenAddress, Math.max(position.amount, 1)),
      fetchSmartMoneyNet(position.tokenAddress),
    ]);

    const positionAlerts = buildThreats(updatedPosition, verdict, liquidityImpact, smartMoneyNet);
    let exited = false;

    for (const alert of positionAlerts) {
      if (shouldAutoExit(state, alert) || alert.action === 'auto-exit') {
        const exitResult = await triggerAutoExit(state, updatedPosition, alert, verdict);
        state.addThreat(exitResult.alert);
        alerts.push(exitResult.alert);
        soldTokenAddresses.add(position.tokenAddress);
        exited = true;
        break;
      }

      state.addThreat(alert);
      alerts.push(alert);
    }

    if (!exited) {
      nextPositions.push(updatedPosition);
    }
  }

  state.replacePositions(nextPositions.filter((position) => !soldTokenAddresses.has(position.tokenAddress)));
  return alerts;
}
