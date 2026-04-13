import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

import { env } from './config.js';
import {
  DEFAULT_SLIPPAGE,
  XLAYER_TOKENS,
  XLAYER_RPC_FALLBACK,
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

const ERC20_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

// Nonce mutex: both the Scout (Loop A) and Sentinel (Loop B) timers share the
// same ethers.Wallet. Without a mutex they can race on the same nonce and one
// of the transactions will revert with "nonce too low". We serialise every
// write the signer performs with this simple chained-promise mutex.
let nonceMutex: Promise<void> = Promise.resolve();
let nextManagedNonce: number | null = null;
let managedNonceAddress = '';

const XLAYER_MIN_GAS_PRICE_WEI = 20_000_000n;
const FEE_FLOOR_MULTIPLIER = 3n;

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

async function readRpcNonce(url: string, address: string, blockTag: 'latest' | 'pending'): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionCount',
        params: [address, blockTag],
      }),
    });
    const json = await response.json() as { result?: string };
    return typeof json.result === 'string' ? Number.parseInt(json.result, 16) : null;
  } catch {
    return null;
  }
}

async function readBestNetworkNonce(address: string): Promise<{ latest: number; pending: number }> {
  const rpcUrls = [...new Set([env.rpcUrl, XLAYER_RPC_FALLBACK].filter(Boolean))];
  const [latestValues, pendingValues] = await Promise.all([
    Promise.all(rpcUrls.map((url) => readRpcNonce(url, address, 'latest'))),
    Promise.all(rpcUrls.map((url) => readRpcNonce(url, address, 'pending'))),
  ]);
  const provider = getProvider();
  const providerLatest = await provider.getTransactionCount(address, 'latest').catch(() => 0);
  const providerPending = await provider.getTransactionCount(address, 'pending').catch(() => providerLatest);
  const latest = Math.max(providerLatest, ...latestValues.filter((value): value is number => value !== null));
  const pending = Math.max(latest, providerPending, ...pendingValues.filter((value): value is number => value !== null));
  return { latest, pending };
}

async function reserveNonce(signer: ethers.Wallet): Promise<number> {
  const address = (await signer.getAddress()).toLowerCase();
  const { latest, pending } = await readBestNetworkNonce(address);

  if (managedNonceAddress !== address) {
    managedNonceAddress = address;
    nextManagedNonce = null;
  }

  if (pending > latest) {
    console.warn(`[Executor] Wallet has ${pending - latest} pending transaction(s); appending at nonce ${pending}.`);
  }

  const nonce = nextManagedNonce === null
    ? pending
    : Math.max(nextManagedNonce, pending);
  nextManagedNonce = nonce + 1;
  return nonce;
}

function resetManagedNonce() {
  nextManagedNonce = null;
}

function isReplacementUnderpriced(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybe = error as { code?: unknown; message?: unknown; shortMessage?: unknown; info?: { error?: { message?: unknown } } };
  const text = [
    maybe.code,
    maybe.message,
    maybe.shortMessage,
    maybe.info?.error?.message,
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('replacement') && (text.includes('underpriced') || text.includes('fee too low'));
}

function maxBigInt(...values: Array<bigint | undefined>): bigint {
  return values.reduce<bigint>((max, value) => (
    value !== undefined && value > max ? value : max
  ), 0n);
}

async function getFeeFloor(attempt: number): Promise<bigint> {
  const feeData = await getProvider().getFeeData().catch(() => null);
  const networkFee = maxBigInt(
    feeData?.maxFeePerGas ?? undefined,
    feeData?.gasPrice ?? undefined,
    XLAYER_MIN_GAS_PRICE_WEI,
  );
  return networkFee * FEE_FLOOR_MULTIPLIER * (2n ** BigInt(attempt));
}

async function applyFeePolicy(request: ethers.TransactionRequest, attempt: number): Promise<ethers.TransactionRequest> {
  const feeFloor = await getFeeFloor(attempt);
  const next: ethers.TransactionRequest = { ...request };
  const hasEip1559 = next.maxFeePerGas !== undefined || next.maxPriorityFeePerGas !== undefined;

  if (hasEip1559) {
    const priorityFee = maxBigInt(next.maxPriorityFeePerGas as bigint | undefined, feeFloor);
    const maxFee = maxBigInt(next.maxFeePerGas as bigint | undefined, priorityFee, feeFloor);
    next.maxPriorityFeePerGas = priorityFee;
    next.maxFeePerGas = maxFee;
    delete next.gasPrice;
    return next;
  }

  next.gasPrice = maxBigInt(next.gasPrice as bigint | undefined, feeFloor);
  return next;
}

async function canExecuteTransaction(signer: ethers.Wallet, request: ethers.TransactionRequest): Promise<boolean> {
  try {
    await getProvider().call({
      ...request,
      from: await signer.getAddress(),
    });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[Executor] Swap transaction failed preflight eth_call; skipping broadcast. ${reason.slice(0, 240)}`);
    return false;
  }
}

// Timeout wrapper for tx.wait() - without this, a stuck transaction can hang
// the Scout or Sentinel loop for the full default ethers timeout (~hours).
// On X Layer we expect ~2-4s finality, so 90s is generous.
const TX_WAIT_TIMEOUT_MS = 90_000;

async function waitForTxWithTimeout(tx: ethers.TransactionResponse): Promise<TradeExecution['status']> {
  try {
    const receipt = await Promise.race([
      tx.wait(1),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TX_WAIT_TIMEOUT_MS)),
    ]);
    if (!receipt) {
      console.error(`[Executor] Transaction ${tx.hash} not confirmed within ${TX_WAIT_TIMEOUT_MS}ms`);
      return 'pending';
    }
    return receipt.status === 1 ? 'confirmed' : 'failed';
  } catch (error) {
    console.error('[Executor] tx.wait failed:', error);
    return 'failed';
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

async function getErc20Balance(tokenAddress: string, owner: string): Promise<number> {
  try {
    const [raw, decimals] = await Promise.all([
      new ethers.Contract(tokenAddress, ERC20_BALANCE_ABI, getProvider()).balanceOf(owner) as Promise<bigint>,
      getTokenDecimals(tokenAddress, 6),
    ]);
    return fromBaseUnits(raw, decimals);
  } catch {
    return 0;
  }
}

async function pickUsdtSpendToken(walletAddress: string, amountUsdt: number): Promise<string> {
  const [currentUsdt, legacyUsdt] = await Promise.all([
    getErc20Balance(XLAYER_TOKENS.USDT, walletAddress),
    getErc20Balance(XLAYER_TOKENS.XLAYER_USDT, walletAddress),
  ]);

  if (currentUsdt >= amountUsdt) {
    return XLAYER_TOKENS.USDT;
  }
  if (legacyUsdt >= amountUsdt) {
    return XLAYER_TOKENS.XLAYER_USDT;
  }

  return currentUsdt >= legacyUsdt ? XLAYER_TOKENS.USDT : XLAYER_TOKENS.XLAYER_USDT;
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
    let maxFeePerGas = raw.maxFeePerGas !== undefined
      ? parseTxValue(raw.maxFeePerGas)
      : undefined;
    let maxPriorityFeePerGas = raw.maxPriorityFeePerGas !== undefined
      ? parseTxValue(raw.maxPriorityFeePerGas)
      : undefined;

    if (maxFeePerGas === undefined && maxPriorityFeePerGas !== undefined) {
      maxFeePerGas = maxPriorityFeePerGas;
    }

    if (maxFeePerGas !== undefined && maxPriorityFeePerGas !== undefined && maxPriorityFeePerGas > maxFeePerGas) {
      console.warn('[Executor] OKX returned maxPriorityFeePerGas > maxFeePerGas; raising maxFeePerGas before signing.');
      maxFeePerGas = maxPriorityFeePerGas;
    }

    if (maxFeePerGas !== undefined) {
      request.maxFeePerGas = maxFeePerGas;
    }
    if (maxPriorityFeePerGas !== undefined) {
      request.maxPriorityFeePerGas = maxPriorityFeePerGas;
    }
    // Explicitly do NOT set gasPrice — mixing it with EIP-1559 fields causes
    // ethers v6 to throw "eip-1559 transaction do not support gasPrice".
  } else if (raw.gasPrice !== undefined) {
    request.gasPrice = parseTxValue(raw.gasPrice);
  }

  return request;
}

async function sendRawTransaction(rawTx: Record<string, unknown>, fallbackTo: string): Promise<{ txHash: string; status: TradeExecution['status'] } | null> {
  const signer = getSigner();
  if (!signer) {
    return null;
  }

  return withNonceMutex(async () => {
    const baseRequest = buildTransactionRequest(rawTx, fallbackTo);
    baseRequest.nonce = await reserveNonce(signer);
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const request = await applyFeePolicy(baseRequest, attempt);
      try {
        if (!await canExecuteTransaction(signer, request)) {
          resetManagedNonce();
          return null;
        }
        const tx = await signer.sendTransaction(request);
        const status = await waitForTxWithTimeout(tx);
        return { txHash: tx.hash, status };
      } catch (error) {
        lastError = error;
        if (isReplacementUnderpriced(error) && attempt < 2) {
          console.warn(`[Executor] Replacement fee too low for nonce ${String(baseRequest.nonce)}; retrying with higher X Layer gas.`);
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Raw transaction failed');
  }).catch((error) => {
    resetManagedNonce();
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

  const txResult = await sendRawTransaction(rawTx, rawTx.to as string);
  if (!txResult || txResult.status === 'failed') {
    return null;
  }

  return {
    amountOut: fromBaseUnits(swapData.toTokenAmount ?? quote.toTokenAmount, params.toDecimals),
    txHash: txResult.txHash,
    status: txResult.status,
    raw: { quote, swapData, explorerUrl: getExplorerUrl(txResult.txHash) },
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

  const fromTokenAddress = params.side === 'buy'
    ? await pickUsdtSpendToken(params.walletAddress, params.amount)
    : params.tokenAddress;
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
  amountOverrideUsdt?: number,
): Promise<TradeExecution | null> {
  const snapshot = state.get();
  const currentExposure = calculatePortfolioExposure(snapshot.positions);
  const remainingCapacity = snapshot.config.maxPortfolioSizeUsdt - currentExposure;
  const requestedSize = amountOverrideUsdt !== undefined && Number.isFinite(amountOverrideUsdt)
    ? Math.max(0, amountOverrideUsdt)
    : snapshot.config.maxPositionSizeUsdt;
  const amountIn = Math.min(snapshot.walletBalance, snapshot.config.maxPositionSizeUsdt, requestedSize, remainingCapacity);

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
  amountOverride?: number,
): Promise<TradeExecution> {
  const snapshot = state.get();
  const amountToSell = amountOverride !== undefined && Number.isFinite(amountOverride)
    ? Math.min(position.amount, Math.max(0, amountOverride))
    : position.amount;

  if (amountToSell <= 0) {
    const failedTrade = buildFailedTrade({
      side: 'sell',
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      amountIn: amountToSell,
      verdict,
    });
    state.addTrade(failedTrade);
    return failedTrade;
  }

  const swap = await requestSwap({
    side: 'sell',
    tokenAddress: position.tokenAddress,
    amount: amountToSell,
    walletAddress: snapshot.walletAddress,
  });

  if (!swap || swap.status === 'failed') {
    const failedTrade = buildFailedTrade({
      side: 'sell',
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      amountIn: amountToSell,
      verdict,
    });
    state.addTrade(failedTrade);
    return failedTrade;
  }

  const remainingAmount = position.amount - amountToSell;
  if (remainingAmount <= Math.max(1e-12, position.amount * 0.000001)) {
    state.removePosition(position.tokenAddress);
  } else {
    state.upsertPosition({
      ...position,
      amount: remainingAmount,
      pnlUsd: position.pnlUsd * (remainingAmount / position.amount),
    });
  }
  state.setWalletBalance(snapshot.walletBalance + swap.amountOut);
  state.broadcastState();

  const trade: TradeExecution = {
    id: uuidv4(),
    type: 'sell',
    tokenAddress: position.tokenAddress,
    tokenSymbol: position.tokenSymbol,
    amountIn: amountToSell,
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
