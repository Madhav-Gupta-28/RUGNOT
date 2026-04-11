import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

import { env } from './config.js';
import {
  DEFAULT_SLIPPAGE,
  XLAYER_CHAIN_ID,
  XLAYER_TOKENS,
  fromBaseUnits,
  getAggregatorQuote,
  getAggregatorSwapData,
  getApproveTransaction,
  getDexClient,
  getSigner,
  getTokenDecimals,
  toBaseUnits,
} from './okx-api.js';
import type { StateStore } from './state.js';
import type { Position, TradeExecution, Verdict, VettedOpportunity } from './types.js';

interface SwapResult {
  amountOut: number;
  txHash: string;
  status: TradeExecution['status'];
  raw: unknown;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculatePortfolioExposure(positions: Position[]): number {
  return positions.reduce((sum, position) => sum + (position.amount * position.currentPrice), 0);
}

function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === XLAYER_TOKENS.OKB.toLowerCase();
}

function getExplorerUrl(txHash: string): string {
  return `https://www.oklink.com/xlayer/tx/${txHash}`;
}

function parseTxValue(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string' && value) {
    return BigInt(value);
  }
  return 0n;
}

function buildTransactionRequest(raw: Record<string, unknown>, fallbackTo: string): ethers.TransactionRequest {
  const gas = raw.gas ?? raw.gasLimit;
  const request: ethers.TransactionRequest = {
    to: typeof raw.to === 'string' && raw.to ? raw.to : fallbackTo,
    data: typeof raw.data === 'string' ? raw.data : '0x',
    value: parseTxValue(raw.value),
  };

  if (gas !== undefined) {
    request.gasLimit = parseTxValue(gas);
  }
  if (raw.gasPrice !== undefined) {
    request.gasPrice = parseTxValue(raw.gasPrice);
  }
  if (raw.maxFeePerGas !== undefined) {
    request.maxFeePerGas = parseTxValue(raw.maxFeePerGas);
  }
  if (raw.maxPriorityFeePerGas !== undefined) {
    request.maxPriorityFeePerGas = parseTxValue(raw.maxPriorityFeePerGas);
  }

  return request;
}

async function sendRawTransaction(rawTx: Record<string, unknown>, fallbackTo: string): Promise<string | null> {
  const signer = getSigner();
  if (!signer) {
    return null;
  }

  try {
    const tx = await signer.sendTransaction(buildTransactionRequest(rawTx, fallbackTo));
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch (error) {
    console.error('[Executor] Raw transaction failed:', error);
    return null;
  }
}

async function executeSdkSwap(params: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  toDecimals: number;
  walletAddress: string;
}): Promise<SwapResult | null> {
  const client = getDexClient();
  if (!client) {
    return null;
  }

  try {
    const quote = await client.dex.getQuote({
      chainIndex: XLAYER_CHAIN_ID,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippagePercent: DEFAULT_SLIPPAGE,
    });
    const quoteData = quote.data?.[0];

    if (!isNativeToken(params.fromTokenAddress)) {
      await client.dex.executeApproval({
        chainIndex: XLAYER_CHAIN_ID,
        tokenContractAddress: params.fromTokenAddress,
        approveAmount: params.amount,
      });
    }

    const swap = await client.dex.executeSwap({
      chainIndex: XLAYER_CHAIN_ID,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippagePercent: DEFAULT_SLIPPAGE,
      userWalletAddress: params.walletAddress,
    });

    const amountOut = swap.details?.toToken?.amount
      ? readNumber(swap.details.toToken.amount)
      : fromBaseUnits(quoteData?.toTokenAmount ?? '0', params.toDecimals);

    return {
      amountOut,
      txHash: swap.transactionId,
      status: swap.success ? 'confirmed' : 'failed',
      raw: { quote, swap },
    };
  } catch (error) {
    console.warn('[Executor] OKX SDK swap failed, falling back to REST:', error);
    return null;
  }
}

async function executeRawRestSwap(params: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  toDecimals: number;
  walletAddress: string;
}): Promise<SwapResult | null> {
  const quote = await getAggregatorQuote({
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    slippage: DEFAULT_SLIPPAGE,
  });

  if (!quote) {
    return null;
  }

  if (!isNativeToken(params.fromTokenAddress)) {
    const approval = await getApproveTransaction({
      tokenContractAddress: params.fromTokenAddress,
      approveAmount: params.amount,
    });
    const approvalTx = (approval?.tx ?? approval) as Record<string, unknown> | null;
    if (approvalTx?.data || approvalTx?.to) {
      const approvalHash = await sendRawTransaction(approvalTx, params.fromTokenAddress);
      if (!approvalHash) {
        console.warn('[Executor] Approval transaction could not be broadcast.');
      }
    }
  }

  const swapData = await getAggregatorSwapData({
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    slippage: DEFAULT_SLIPPAGE,
    userWalletAddress: params.walletAddress,
  });
  if (!swapData) {
    return null;
  }

  const rawTx = swapData.tx as Record<string, unknown> | undefined;

  if (!rawTx) {
    return null;
  }

  const txHash = await sendRawTransaction(rawTx, rawTx.to as string);
  if (!txHash) {
    return null;
  }

  return {
    amountOut: fromBaseUnits(swapData.toTokenAmount ?? quote.toTokenAmount, params.toDecimals),
    txHash,
    status: 'confirmed',
    raw: { quote, swapData, explorerUrl: getExplorerUrl(txHash) },
  };
}

async function requestSwap(params: {
  side: 'buy' | 'sell';
  tokenAddress: string;
  amount: number;
  walletAddress: string;
}): Promise<SwapResult | null> {
  if (!env.okxCredentialsConfigured || !env.privateKey) {
    console.warn('[Executor] Live swap skipped: OKX credentials or PRIVATE_KEY missing.');
    return null;
  }

  const fromTokenAddress = params.side === 'buy' ? XLAYER_TOKENS.USDT : params.tokenAddress;
  const toTokenAddress = params.side === 'buy' ? params.tokenAddress : XLAYER_TOKENS.USDT;
  const fromDecimals = params.side === 'buy' ? 6 : await getTokenDecimals(params.tokenAddress);
  const toDecimals = params.side === 'buy' ? await getTokenDecimals(params.tokenAddress) : 6;
  const amount = toBaseUnits(params.amount, fromDecimals);

  return await executeSdkSwap({
    fromTokenAddress,
    toTokenAddress,
    amount,
    toDecimals,
    walletAddress: params.walletAddress,
  }) ?? await executeRawRestSwap({
    fromTokenAddress,
    toTokenAddress,
    amount,
    toDecimals,
    walletAddress: params.walletAddress,
  });
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

  state.removePosition(position.tokenAddress);
  state.setWalletBalance(snapshot.walletBalance + swap.amountOut);
  state.broadcastState();

  const trade: TradeExecution = {
    id: uuidv4(),
    type: 'sell',
    tokenAddress: position.tokenAddress,
    tokenSymbol: position.tokenSymbol,
    amountIn: position.amount,
    amountOut: swap.amountOut,
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
