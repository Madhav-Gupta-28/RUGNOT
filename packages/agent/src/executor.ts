import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { callOkxApi, fetchTokenPrice } from './okx-api.js';
import type { StateStore } from './state.js';
import type { Position, TradeExecution, Verdict, VettedOpportunity } from './types.js';

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function toBaseUnits(amount: number, decimals = 6): string {
  return String(Math.max(0, Math.round(amount * (10 ** decimals))));
}

function calculatePortfolioExposure(positions: Position[]): number {
  return positions.reduce((sum, position) => sum + (position.amount * position.currentPrice), 0);
}

function mergeBoughtPosition(existing: Position | undefined, params: {
  tokenAddress: string;
  tokenSymbol: string;
  amountOut: number;
  entryPrice: number;
  verdict: Verdict;
}): Position {
  if (!existing) {
    return {
      tokenAddress: params.tokenAddress,
      tokenSymbol: params.tokenSymbol,
      amount: params.amountOut,
      entryPrice: params.entryPrice,
      currentPrice: params.entryPrice,
      pnlPercent: 0,
      pnlUsd: 0,
      lastSecurityCheck: params.verdict.timestamp,
      lastVerdictLevel: params.verdict.level,
    };
  }

  const nextAmount = existing.amount + params.amountOut;
  const weightedEntryPrice = nextAmount === 0
    ? params.entryPrice
    : ((existing.amount * existing.entryPrice) + (params.amountOut * params.entryPrice)) / nextAmount;

  return {
    ...existing,
    amount: nextAmount,
    entryPrice: weightedEntryPrice,
    currentPrice: params.entryPrice,
    lastSecurityCheck: params.verdict.timestamp,
    lastVerdictLevel: params.verdict.level,
  };
}

function updatePositionPnl(position: Position, currentPrice: number): Position {
  const pnlPercent = position.entryPrice > 0
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : 0;
  const pnlUsd = (currentPrice - position.entryPrice) * position.amount;

  return {
    ...position,
    currentPrice,
    pnlPercent,
    pnlUsd,
  };
}

async function requestSwap(params: {
  side: 'buy' | 'sell';
  tokenAddress: string;
  amount: number;
  walletAddress: string;
}): Promise<{ amountOut: number; txHash: string; status: TradeExecution['status']; raw: unknown } | null> {
  const fromTokenAddress = params.side === 'buy' ? 'USDT' : params.tokenAddress;
  const toTokenAddress = params.side === 'buy' ? params.tokenAddress : 'USDT';
  const amount = toBaseUnits(params.amount);

  const quote = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/swap/quote?chainId=${env.agentChainId}&fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}`,
  );

  if (!quote) {
    return null;
  }

  const execution = await callOkxApi<Record<string, unknown>>(
    'POST',
    '/api/v5/dex/swap/execute',
    {
      chainId: env.agentChainId,
      walletAddress: params.walletAddress,
      fromTokenAddress,
      toTokenAddress,
      amount,
      slippage: '1',
      quoteId: quote.quoteId ?? quote.routeId,
    },
  );

  if (!execution) {
    return {
      amountOut: readNumber(quote.toTokenAmount ?? quote.amountOut),
      txHash: '',
      status: 'failed',
      raw: quote,
    };
  }

  return {
    amountOut: readNumber(execution.amountOut ?? execution.toTokenAmount ?? quote.toTokenAmount),
    txHash: readString(execution.txHash ?? execution.transactionHash),
    status: readString(execution.status, 'confirmed') as TradeExecution['status'],
    raw: execution,
  };
}

function buildFailedTrade(params: {
  side: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol: string;
  amountIn: number;
  verdict?: Verdict;
}): TradeExecution {
  return {
    id: uuidv4(),
    type: params.side,
    tokenAddress: params.tokenAddress,
    tokenSymbol: params.tokenSymbol,
    amountIn: params.amountIn,
    amountOut: 0,
    txHash: '',
    status: 'failed',
    verdict: params.verdict,
    timestamp: Date.now(),
  };
}

export async function executeOpportunity(
  opportunity: VettedOpportunity,
  state: StateStore,
): Promise<TradeExecution | null> {
  const snapshot = state.get();
  const currentExposure = calculatePortfolioExposure(snapshot.positions);
  const remainingCapacity = snapshot.config.maxPortfolioSizeUsdt - currentExposure;
  const amountIn = Math.min(snapshot.walletBalance, snapshot.config.maxPositionSizeUsdt, remainingCapacity);

  if (amountIn <= 0) {
    return null;
  }

  const swap = await requestSwap({
    side: 'buy',
    tokenAddress: opportunity.tokenAddress,
    amount: amountIn,
    walletAddress: snapshot.walletAddress,
  });

  if (!swap || swap.status === 'failed') {
    const failedTrade = buildFailedTrade({
      side: 'buy',
      tokenAddress: opportunity.tokenAddress,
      tokenSymbol: opportunity.tokenSymbol,
      amountIn,
      verdict: opportunity.verdict,
    });
    state.addTrade(failedTrade);
    return failedTrade;
  }

  const amountOut = swap.amountOut > 0 ? swap.amountOut : amountIn / Math.max(opportunity.currentPrice, 0.000001);
  const entryPrice = opportunity.currentPrice > 0 ? opportunity.currentPrice : amountIn / Math.max(amountOut, 0.000001);
  const existing = snapshot.positions.find((position) => position.tokenAddress === opportunity.tokenAddress);
  const position = mergeBoughtPosition(existing, {
    tokenAddress: opportunity.tokenAddress,
    tokenSymbol: opportunity.tokenSymbol,
    amountOut,
    entryPrice,
    verdict: opportunity.verdict,
  });

  state.upsertPosition(position);
  state.setWalletBalance(Math.max(0, snapshot.walletBalance - amountIn));

  const trade: TradeExecution = {
    id: uuidv4(),
    type: 'buy',
    tokenAddress: opportunity.tokenAddress,
    tokenSymbol: opportunity.tokenSymbol,
    amountIn,
    amountOut,
    txHash: swap.txHash,
    status: swap.status,
    verdict: opportunity.verdict,
    timestamp: Date.now(),
  };

  state.addTrade(trade);
  state.broadcastState();
  return trade;
}

export async function executeSell(
  position: Position,
  state: StateStore,
  verdict?: Verdict,
): Promise<TradeExecution> {
  const snapshot = state.get();
  const swap = await requestSwap({
    side: 'sell',
    tokenAddress: position.tokenAddress,
    amount: position.amount,
    walletAddress: snapshot.walletAddress,
  });

  if (!swap || swap.status === 'failed') {
    const failedTrade = buildFailedTrade({
      side: 'sell',
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      amountIn: position.amount,
      verdict,
    });
    state.addTrade(failedTrade);
    return failedTrade;
  }

  const amountOut = swap.amountOut > 0
    ? swap.amountOut
    : position.amount * (await fetchTokenPrice(position.tokenAddress) ?? position.currentPrice);

  state.removePosition(position.tokenAddress);
  state.setWalletBalance(snapshot.walletBalance + amountOut);
  state.broadcastState();

  const trade: TradeExecution = {
    id: uuidv4(),
    type: 'sell',
    tokenAddress: position.tokenAddress,
    tokenSymbol: position.tokenSymbol,
    amountIn: position.amount,
    amountOut,
    txHash: swap.txHash,
    status: swap.status,
    verdict,
    timestamp: Date.now(),
  };

  state.addTrade(trade);
  return trade;
}

export function refreshPositionMark(position: Position, currentPrice: number): Position {
  return updatePositionPnl(position, currentPrice);
}
