import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

import { env } from './config.js';
import {
  DEFAULT_SLIPPAGE,
  XLAYER_TOKENS,
  fromBaseUnits,
  getAggregatorQuote,
  getAggregatorSwapData,
  getApproveTransaction,
  getProvider,
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

const ERC20_APPROVE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Nonce mutex: both the Scout (Loop A) and Sentinel (Loop B) timers share the
// same ethers.Wallet. Without a mutex they can race on the same nonce and one
// of the transactions will revert with "nonce too low". We serialise every
// write the signer performs with this simple chained-promise mutex.
let nonceMutex: Promise<void> = Promise.resolve();

async function withNonceMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prior = nonceMutex;
  let release: () => void = () => {};
  nonceMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await prior;
    return await fn();
  } finally {
    release();
  }
}

// Timeout wrapper for tx.wait() - without this, a stuck transaction can hang
// the Scout or Sentinel loop for the full default ethers timeout (~hours).
// On X Layer we expect ~2-4s finality, so 90s is generous.
const TX_WAIT_TIMEOUT_MS = 90_000;

async function waitForTxWithTimeout(tx: ethers.TransactionResponse): Promise<string | null> {
  try {
    const receipt = await Promise.race([
      tx.wait(1),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TX_WAIT_TIMEOUT_MS)),
    ]);
    if (!receipt) {
      console.error(`[Executor] Transaction ${tx.hash} not confirmed within ${TX_WAIT_TIMEOUT_MS}ms`);
      return null;
    }
    return receipt.hash ?? tx.hash;
  } catch (error) {
    console.error('[Executor] tx.wait failed:', error);
    return null;
  }
}

function calculatePortfolioExposure(positions: Position[]): number {
  return positions.reduce((sum, position) => sum + (position.amount * position.currentPrice), 0);
}

function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === XLAYER_TOKENS.OKB.toLowerCase();
}

function getExplorerUrl(txHash: string): string {
  // OKLink accepts both `/xlayer/tx/` and `/x-layer/tx/`; the latter is the
  // newer canonical path, so we emit that.
  return `https://www.oklink.com/x-layer/tx/${txHash}`;
}

async function getErc20Allowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_APPROVE_ABI, getProvider());
    return (await contract.allowance(owner, spender)) as bigint;
  } catch (error) {
    console.warn('[Executor] Could not read current ERC20 allowance:', error);
    return 0n;
  }
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

  // OKX v6 swap API sometimes returns BOTH gasPrice AND maxPriorityFeePerGas in
  // the same response. EIP-1559 (type 2) transactions must NOT include gasPrice —
  // ethers v6 rejects the tx with INVALID_ARGUMENT if both are present.
  // Rule: prefer EIP-1559 fields; only fall back to legacy gasPrice when neither
  // maxFeePerGas nor maxPriorityFeePerGas is provided by the API.
  const hasEip1559 = raw.maxFeePerGas !== undefined || raw.maxPriorityFeePerGas !== undefined;

  if (hasEip1559) {
    if (raw.maxFeePerGas !== undefined) {
      request.maxFeePerGas = parseTxValue(raw.maxFeePerGas);
    }
    if (raw.maxPriorityFeePerGas !== undefined) {
      request.maxPriorityFeePerGas = parseTxValue(raw.maxPriorityFeePerGas);
    }
    // Explicitly do NOT set gasPrice — mixing it with EIP-1559 fields causes
    // ethers v6 to throw "eip-1559 transaction do not support gasPrice".
  } else if (raw.gasPrice !== undefined) {
    request.gasPrice = parseTxValue(raw.gasPrice);
  }

  return request;
}

async function sendRawTransaction(rawTx: Record<string, unknown>, fallbackTo: string): Promise<string | null> {
  const signer = getSigner();
  if (!signer) {
    return null;
  }

  return withNonceMutex(async () => {
    const tx = await signer.sendTransaction(buildTransactionRequest(rawTx, fallbackTo));
    return await waitForTxWithTimeout(tx);
  }).catch((error) => {
    console.error('[Executor] Raw transaction failed:', error);
    return null;
  });
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
    const spender = typeof approval?.dexContractAddress === 'string' ? approval.dexContractAddress : '';
    const currentAllowance = spender
      ? await getErc20Allowance(params.fromTokenAddress, params.walletAddress, spender)
      : 0n;
    if (approvalTx?.data || approvalTx?.to) {
      if (currentAllowance >= BigInt(params.amount)) {
        console.log('[Executor] Existing ERC20 allowance is sufficient; skipping approval.');
      } else {
        const approvalHash = await sendRawTransaction(approvalTx, params.fromTokenAddress);
        if (!approvalHash) {
          console.warn('[Executor] Approval transaction could not be broadcast.');
        }
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

  return await executeRawRestSwap({
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
