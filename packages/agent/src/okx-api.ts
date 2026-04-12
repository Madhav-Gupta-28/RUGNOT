import crypto from 'node:crypto';

import { OKXDexClient } from '@okx-dex/okx-dex-sdk';
import { createEVMWallet } from '@okx-dex/okx-dex-sdk/dist/core/evm-wallet.js';
import { ethers } from 'ethers';

import { env } from './config.js';
import type { Position, TradeOpportunity } from './types.js';

export const XLAYER_CHAIN_ID = '196';
export const XLAYER_RPC_FALLBACK = 'https://xlayerrpc.okx.com';
export const OKX_WEB3_BASE_URL = 'https://web3.okx.com';

// OKX DEX API was upgraded from v5 to v6 on 2025-09-25. v6 renamed:
//   chainId         -> chainIndex
//   slippage        -> slippagePercent (and changed the scale: "0.5" now means 0.5%,
//                                        no longer "0.005" for 0.5%)
// See https://web3.okx.com/build/dev-docs/wallet-api/change-log
export const OKX_AGGREGATOR_BASE_PATH = '/api/v6/dex/aggregator';
export const OKX_MARKET_BASE_PATH = '/api/v6/dex/market';

// Slippage expressed as a percentage (not a decimal). "1" = 1%.
// The SDK's slippagePercent field uses the same scale.
export const DEFAULT_SLIPPAGE = '1';

export const XLAYER_TOKENS = {
  OKB: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  WOKB: '0x75E1AB5E0e3BA13b3520349F069350441CF53c0A',
  WETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  // Current OKX-routed USDT on X Layer. The older 0x1E4a... token is still
  // routable as XLAYER_USDT on the aggregator, but new OKX deposits are landing
  // in this USDt0 / USDT contract.
  USDT: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
  XLAYER_USDT: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
  USDC: '0x74b7F16337b8972027F6196A17a631ac6dE26d22',
} as const;

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T[];
}

export interface TokenInfo {
  decimal?: string;
  decimals?: string;
  isHoneyPot?: boolean;
  taxRate?: string;
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenUnitPrice?: string;
  tokenName?: string;
}

export interface AggregatorQuote {
  chainIndex?: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromTokenAmount: string;
  toTokenAmount: string;
  priceImpactPercent?: string;
  priceImpactPercentage?: string;
  estimateGasFee?: string;
  router?: string;
  tx?: AggregatorTx;
}

export interface AggregatorTx {
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface CallOkxApiOptions<T> {
  cliCommand?: string;
  mapCliResult?: (value: unknown) => T | null;
  retries?: number;
}

let provider: ethers.JsonRpcProvider | null = null;
let dexClient: OKXDexClient | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasLiveCredentials(): boolean {
  return env.okxCredentialsConfigured;
}

// Simple token-bucket rate limiter so we don't burst past OKX's REST limits.
// OKX caps public DEX endpoints somewhere in the 5-10 req/s range per API key.
// 5 requests per second with a burst of 10 is conservative enough to survive
// all three loops (Scout, Sentinel, x402 /api/v1/security/check) running concurrently.
const RATE_LIMIT_CAPACITY = 10;
const RATE_LIMIT_REFILL_PER_SEC = 5;
let rateLimitTokens = RATE_LIMIT_CAPACITY;
let rateLimitLastRefill = Date.now();

async function acquireRateLimitToken(): Promise<void> {
  while (true) {
    const now = Date.now();
    const elapsedSeconds = (now - rateLimitLastRefill) / 1000;
    if (elapsedSeconds > 0) {
      rateLimitTokens = Math.min(
        RATE_LIMIT_CAPACITY,
        rateLimitTokens + elapsedSeconds * RATE_LIMIT_REFILL_PER_SEC,
      );
      rateLimitLastRefill = now;
    }
    if (rateLimitTokens >= 1) {
      rateLimitTokens -= 1;
      return;
    }
    const deficit = 1 - rateLimitTokens;
    const waitMs = Math.ceil((deficit / RATE_LIMIT_REFILL_PER_SEC) * 1000);
    await sleep(Math.max(50, waitMs));
  }
}

function normalizeResult<T>(value: T | T[] | null): T | T[] | null {
  if (Array.isArray(value) && value.length === 1) {
    return value[0] ?? null;
  }
  return value;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function getHeaders(timestamp: string, method: string, requestPath: string, queryOrBody = ''): Record<string, string> {
  const stringToSign = timestamp + method.toUpperCase() + requestPath + queryOrBody;
  return {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': env.okxApiKey,
    'OK-ACCESS-SIGN': crypto.createHmac('sha256', env.okxSecretKey)
      .update(stringToSign).digest('base64'),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': env.okxPassphrase,
    'OK-ACCESS-PROJECT': env.okxProjectId,
  };
}

export function getProvider(): ethers.JsonRpcProvider {
  provider ??= new ethers.JsonRpcProvider(env.rpcUrl || XLAYER_RPC_FALLBACK);
  return provider;
}

export function getSigner(): ethers.Wallet | null {
  if (!env.privateKey) {
    return null;
  }
  try {
    return new ethers.Wallet(env.privateKey, getProvider());
  } catch (error) {
    console.error('[X Layer] Invalid PRIVATE_KEY:', error);
    return null;
  }
}

export function getDexClient(): OKXDexClient | null {
  if (!hasLiveCredentials() || !env.privateKey) {
    return null;
  }

  if (!dexClient) {
    const wallet = createEVMWallet(env.privateKey, getProvider() as unknown as Parameters<typeof createEVMWallet>[1]);
    dexClient = new OKXDexClient({
      apiKey: env.okxApiKey,
      secretKey: env.okxSecretKey,
      apiPassphrase: env.okxPassphrase,
      projectId: env.okxProjectId,
      evm: { wallet },
      timeout: 15_000,
      maxRetries: 2,
    });
  }

  return dexClient;
}

// The `onchainos` CLI used to be the fallback path for holders / smart-money
// data before we ported everything to the native OKX REST Market API above.
// We keep this stub so older callers (and `callOkxApi`'s `cliCommand` option)
// continue to typecheck - it just returns null in all environments.
export function onchainos(_command: string): any {
  return null;
}

export function callOnchainosCli(command: string): any {
  return onchainos(command);
}

export async function callOkxRest<T>(
  method: 'GET' | 'POST',
  pathWithQuery: string,
  body?: object | object[],
  retries = 2,
  logErrors = true,
): Promise<OkxEnvelope<T> | null> {
  if (!hasLiveCredentials()) {
    return null;
  }

  const [requestPath, rawQuery = ''] = pathWithQuery.split('?');
  const queryString = rawQuery ? `?${rawQuery}` : '';
  const bodyStr = body ? JSON.stringify(body) : '';

  for (let attempt = 0; attempt < retries; attempt += 1) {
    await acquireRateLimitToken();
    try {
      const timestamp = new Date().toISOString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      // For GET, OKX signs `timestamp + METHOD + path + queryString`.
      // For POST, OKX signs `timestamp + METHOD + path + bodyStr` - queryString is
      // not part of the signature. We still attach queryString to the fetch URL in
      // case callers want to mix POST + query params (rare).
      const signaturePayload = method === 'GET' ? queryString : bodyStr;
      const response = await fetch(`${OKX_WEB3_BASE_URL}${requestPath}${queryString}`, {
        method,
        headers: getHeaders(timestamp, method, requestPath, signaturePayload),
        body: method === 'GET' ? undefined : bodyStr,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        if (logErrors) {
          console.error(`[OKX REST] ${response.status} ${method} ${requestPath}${queryString}`);
        }
      } else {
        const json = await response.json() as OkxEnvelope<T>;
        if (json.code === '0') {
          return json;
        }
        if (logErrors) {
          console.error(`[OKX REST] Error ${json.code}: ${json.msg} for ${requestPath}${queryString}`);
        }
      }
    } catch (error) {
      if (logErrors) {
        console.error(`[OKX REST] Network error for ${requestPath}${queryString}:`, error);
      }
    }

    if (attempt < retries - 1) {
      await sleep(1000 * (2 ** attempt));
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// OKX DEX Market API (v6) - replaces the onchainos CLI shellouts that used to
// power signal discovery, holder concentration checks, and smart-money flow.
// ---------------------------------------------------------------------------

export interface MarketPriceInfo {
  chainIndex: string;
  tokenContractAddress: string;
  time?: string;
  price?: string;
  marketCap?: string;
  priceChange5M?: string;
  priceChange1H?: string;
  priceChange4H?: string;
  priceChange24H?: string;
  volume5M?: string;
  volume1H?: string;
  volume4H?: string;
  volume24H?: string;
  circSupply?: string;
  liquidity?: string;
  holders?: string;
}

export interface MarketSignalToken {
  tokenAddress?: string;
  tokenContractAddress?: string;
  symbol?: string;
  name?: string;
  logo?: string;
  marketCapUsd?: string;
  holders?: string;
  top10HolderPercent?: string;
}

export interface MarketSignal {
  timestamp?: string;
  chainIndex?: string;
  token?: MarketSignalToken;
  price?: string;
  walletType?: string;
  triggerWalletCount?: string;
  triggerWalletAddress?: string;
  amountUsd?: string;
  soldRatioPercent?: string;
  cursor?: string;
}

export interface MarketTopToken {
  chainIndex?: string;
  change?: string;
  firstTradeTime?: string;
  holders?: string;
  liquidity?: string;
  marketCap?: string;
  price?: string;
  tokenContractAddress?: string;
  tokenLogoUrl?: string;
  tokenSymbol?: string;
  txs?: string;
  txsBuy?: string;
  txsSell?: string;
  uniqueTraders?: string;
  volume?: string;
}

export interface TokenHolderEntry {
  holdPercent?: string;
  holdAmount?: string;
  holderWalletAddress?: string;
  totalPnlUsd?: string;
  realizedPnlUsd?: string;
  unrealizedPnlUsd?: string;
}

export interface TokenBalanceAsset {
  chainIndex?: string;
  tokenContractAddress?: string;
  symbol?: string;
  tokenSymbol?: string;
  balance?: string;
  rawBalance?: string;
  uiAmount?: string;
  price?: string;
  tokenPrice?: string;
}

let marketSignalListUnavailableUntil = 0;

export async function getMarketPriceInfo(tokenAddresses: string[]): Promise<MarketPriceInfo[]> {
  if (tokenAddresses.length === 0) {
    return [];
  }
  const body = tokenAddresses.map((tokenContractAddress) => ({
    chainIndex: env.agentChainId,
    tokenContractAddress,
  }));
  const response = await callOkxRest<MarketPriceInfo>(
    'POST',
    `${OKX_MARKET_BASE_PATH}/price-info`,
    body,
  );
  return response?.data ?? [];
}

/**
 * walletType: "1" = Smart Money, "2" = KOL/Influencer, "3" = Whales.
 * tokenAddress is optional: if omitted, the API returns latest signals across all tokens on the chain.
 */
export async function getMarketSignalList(params: {
  walletType?: string;
  tokenAddress?: string;
  minAmountUsd?: string;
  minLiquidityUsd?: string;
  limit?: number;
}): Promise<MarketSignal[]> {
  if (Date.now() < marketSignalListUnavailableUntil) {
    return [];
  }

  const body: Record<string, string> = {
    chainIndex: env.agentChainId,
    limit: String(params.limit ?? 50),
  };
  if (params.walletType) body.walletType = params.walletType;
  if (params.tokenAddress) body.tokenAddress = params.tokenAddress;
  if (params.minAmountUsd) body.minAmountUsd = params.minAmountUsd;
  if (params.minLiquidityUsd) body.minLiquidityUsd = params.minLiquidityUsd;

  const response = await callOkxRest<MarketSignal>(
    'POST',
    `${OKX_MARKET_BASE_PATH}/signal/list`,
    [body],
    1,
    false,
  );
  if (!response) {
    // OKX currently advertises X Layer support for signal/list but can return
    // application error -1 with an empty message. Back off to avoid noisy logs;
    // Scout falls back to token/toplist below.
    marketSignalListUnavailableUntil = Date.now() + 5 * 60_000;
  }
  return response?.data ?? [];
}

export async function getMarketTokenTopList(limit = 50): Promise<MarketTopToken[]> {
  const response = await callOkxRest<MarketTopToken>(
    'GET',
    `${OKX_MARKET_BASE_PATH}/token/toplist${toQueryString({
      chains: env.agentChainId,
      sortBy: 5,
      timeFrame: 4,
    })}`,
    undefined,
    1,
  );

  return (response?.data ?? []).slice(0, limit);
}

export async function getTokenHolders(tokenAddress: string): Promise<TokenHolderEntry[]> {
  const response = await callOkxRest<TokenHolderEntry>(
    'GET',
    `${OKX_MARKET_BASE_PATH}/token/holder${toQueryString({
      chainIndex: env.agentChainId,
      tokenContractAddress: tokenAddress,
    })}`,
  );
  return response?.data ?? [];
}

/**
 * Convenience wrapper that asks the Market API for the Smart Money net flow on
 * a specific token over the most recent signals. Returns signed USD - positive
 * means net buying, negative means net selling, 0 means neutral / no data.
 */
export async function getSmartMoneyNetFlow(tokenAddress: string): Promise<number | null> {
  const signals = await getMarketSignalList({
    walletType: '1',
    tokenAddress,
    limit: 50,
  });
  if (signals.length === 0) {
    return null;
  }
  let net = 0;
  for (const signal of signals) {
    const amount = Number(signal.amountUsd ?? 0);
    if (!Number.isFinite(amount)) continue;
    // `soldRatioPercent` > 0 indicates selling pressure; otherwise treat as buy.
    const soldRatio = Number(signal.soldRatioPercent ?? 0);
    if (Number.isFinite(soldRatio) && soldRatio > 50) {
      net -= amount;
    } else {
      net += amount;
    }
  }
  return net;
}

/**
 * Read top-10 holder concentration from the dedicated token-holder endpoint.
 * If OKX doesn't return holder rows for this token yet, fall back to the
 * latest signal metadata where `top10HolderPercent` is sometimes embedded.
 */
export async function getTop10HolderPercent(tokenAddress: string): Promise<number | null> {
  const holders = await getTokenHolders(tokenAddress);
  if (holders.length > 0) {
    // Defensive sort: guarantee we're summing the largest holders, regardless
    // of the order the API returns them in.
    const sorted = [...holders]
      .map((h) => readNumber(h.holdPercent, 0))
      .sort((a, b) => b - a);
    const top10 = sorted.slice(0, 10).reduce((sum, pct) => sum + pct, 0);
    if (Number.isFinite(top10) && top10 > 0 && top10 <= 100) {
      return top10;
    }
  }

  const signals = await getMarketSignalList({
    tokenAddress,
    limit: 1,
  });
  const first = signals[0];
  const raw = first?.token?.top10HolderPercent;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export async function getTopHolderPercent(tokenAddress: string): Promise<number | null> {
  const holders = await getTokenHolders(tokenAddress);
  if (holders.length === 0) return null;
  // Pick the largest holder's percent, sorting defensively.
  const max = Math.max(...holders.map((h) => readNumber(h.holdPercent, 0)));
  return Number.isFinite(max) && max > 0 && max <= 100 ? max : null;
}

export async function callOkxApi<T>(
  method: string,
  path: string,
  body?: object,
  options: CallOkxApiOptions<T> = {},
): Promise<T | null> {
  const rest = await callOkxRest<T>(method.toUpperCase() === 'POST' ? 'POST' : 'GET', path, body, options.retries ?? 2);
  if (rest?.data) {
    return normalizeResult(rest.data as T | T[]) as T;
  }

  if (!options.cliCommand) {
    return null;
  }

  const cliResult = onchainos(options.cliCommand);
  if (!cliResult) {
    return null;
  }

  if (options.mapCliResult) {
    return options.mapCliResult(cliResult);
  }

  return normalizeResult((cliResult.data ?? cliResult.result ?? cliResult) as T | T[]) as T;
}

export function toBaseUnits(amount: number, decimals: number): string {
  return ethers.parseUnits(String(Math.max(0, amount)), decimals).toString();
}

export function fromBaseUnits(amount: string | number | bigint, decimals: number): number {
  try {
    return Number(ethers.formatUnits(amount, decimals));
  } catch {
    return 0;
  }
}

export async function getAllTokens(): Promise<TokenInfo[]> {
  const response = await callOkxRest<TokenInfo>(
    'GET',
    `${OKX_AGGREGATOR_BASE_PATH}/all-tokens${toQueryString({ chainIndex: env.agentChainId })}`,
  );

  return response?.data ?? [];
}

export async function getTokenMetadata(tokenAddress: string): Promise<TokenInfo | null> {
  const normalized = tokenAddress.toLowerCase();
  const tokens = await getAllTokens();
  return tokens.find((token) => token.tokenContractAddress?.toLowerCase() === normalized) ?? null;
}

export async function getTokenDecimals(tokenAddress: string, fallback = 18): Promise<number> {
  const normalizedToken = tokenAddress.toLowerCase();
  if (
    normalizedToken === XLAYER_TOKENS.USDT.toLowerCase() ||
    normalizedToken === XLAYER_TOKENS.XLAYER_USDT.toLowerCase()
  ) {
    return 6;
  }

  const metadata = await getTokenMetadata(tokenAddress);
  const metadataDecimals = readNumber(metadata?.decimal ?? metadata?.decimals, NaN);
  if (Number.isFinite(metadataDecimals) && metadataDecimals > 0) {
    return metadataDecimals;
  }

  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, getProvider());
    const decimals = Number(await contract.decimals());
    return Number.isFinite(decimals) ? decimals : fallback;
  } catch {
    return fallback;
  }
}

export async function getAggregatorQuote(params: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage?: string;
}): Promise<AggregatorQuote | null> {
  const response = await callOkxRest<AggregatorQuote>(
    'GET',
    `${OKX_AGGREGATOR_BASE_PATH}/quote${toQueryString({
      chainIndex: env.agentChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippagePercent: params.slippage ?? DEFAULT_SLIPPAGE,
    })}`,
  );

  return response?.data?.[0] ?? null;
}

export async function getAggregatorSwapData(params: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippage?: string;
}): Promise<AggregatorQuote | null> {
  const response = await callOkxRest<AggregatorQuote>(
    'GET',
    `${OKX_AGGREGATOR_BASE_PATH}/swap${toQueryString({
      chainIndex: env.agentChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippagePercent: params.slippage ?? DEFAULT_SLIPPAGE,
      userWalletAddress: params.userWalletAddress,
    })}`,
  );

  return response?.data?.[0] ?? null;
}

export async function getApproveTransaction(params: {
  tokenContractAddress: string;
  approveAmount: string;
}): Promise<Record<string, unknown> | null> {
  const response = await callOkxRest<Record<string, unknown>>(
    'GET',
    `${OKX_AGGREGATOR_BASE_PATH}/approve-transaction${toQueryString({
      chainIndex: env.agentChainId,
      tokenContractAddress: params.tokenContractAddress,
      approveAmount: params.approveAmount,
    })}`,
  );

  return response?.data?.[0] ?? null;
}

export async function verifyOkxCredentials(): Promise<boolean> {
  const response = await callOkxRest<Record<string, unknown>>(
    'GET',
    `${OKX_AGGREGATOR_BASE_PATH}/supported/chain`,
    undefined,
    1,
  );

  return Boolean(response?.data?.length);
}

export async function getAllTokenBalancesByAddress(walletAddress: string): Promise<TokenBalanceAsset[]> {
  const response = await callOkxRest<{ tokenAssets?: TokenBalanceAsset[] }>(
    'GET',
    `/api/v6/dex/balance/all-token-balances-by-address${toQueryString({
      address: walletAddress,
      chains: env.agentChainId,
    })}`,
    undefined,
    1,
  );

  return response?.data?.flatMap((entry) => entry.tokenAssets ?? []) ?? [];
}

export async function getWalletOnchainBalances(walletAddress: string): Promise<{ okb: number; usdt: number }> {
  if (!walletAddress || walletAddress === '0x0000000000000000000000000000000000000196') {
    return { okb: 0, usdt: 0 };
  }

  try {
    const currentProvider = getProvider();
    const [okbRaw, usdtRaw, legacyUsdtRaw] = await Promise.all([
      currentProvider.getBalance(walletAddress),
      new ethers.Contract(XLAYER_TOKENS.USDT, ERC20_ABI, currentProvider).balanceOf(walletAddress) as Promise<bigint>,
      new ethers.Contract(XLAYER_TOKENS.XLAYER_USDT, ERC20_ABI, currentProvider).balanceOf(walletAddress) as Promise<bigint>,
    ]);
    const usdt = Number(ethers.formatUnits(usdtRaw, 6));
    const legacyUsdt = Number(ethers.formatUnits(legacyUsdtRaw, 6));

    return {
      okb: Number(ethers.formatEther(okbRaw)),
      usdt: usdt + legacyUsdt,
    };
  } catch (error) {
    console.warn('[X Layer] Could not read wallet balances:', error);
    return { okb: 0, usdt: 0 };
  }
}

export async function fetchWalletBalances(walletAddress: string): Promise<{ walletBalance: number; positions: Position[] }> {
  const balances = await getWalletOnchainBalances(walletAddress);
  const tokenAssets = await getAllTokenBalancesByAddress(walletAddress).catch((error) => {
    console.warn('[OKX Balance] Could not load token balances by address:', error);
    return [] as TokenBalanceAsset[];
  });

  const candidateAssets = tokenAssets
    .filter((asset) => String(asset.chainIndex ?? env.agentChainId) === env.agentChainId)
    .filter((asset) => {
      const tokenAddress = asset.tokenContractAddress?.toLowerCase() ?? '';
      return Boolean(tokenAddress)
        && tokenAddress !== XLAYER_TOKENS.USDT.toLowerCase()
        && tokenAddress !== XLAYER_TOKENS.XLAYER_USDT.toLowerCase()
        && tokenAddress !== XLAYER_TOKENS.WOKB.toLowerCase()
        && tokenAddress !== XLAYER_TOKENS.OKB.toLowerCase()
        && tokenAddress !== XLAYER_TOKENS.WETH.toLowerCase();
    });

  const positions = (await Promise.all(candidateAssets.map(async (asset) => {
      const tokenAddress = asset.tokenContractAddress ?? '';
      let amount = readNumber(asset.balance ?? asset.uiAmount ?? 0, 0);

      // OKX's wallet-balance index can lag immediately after a sell. Confirm
      // candidate positions against the chain so the dashboard doesn't show
      // already-closed tokens as still invested.
      try {
        const decimals = await getTokenDecimals(tokenAddress);
        const rawBalance = await new ethers.Contract(tokenAddress, ERC20_ABI, getProvider()).balanceOf(walletAddress) as bigint;
        amount = fromBaseUnits(rawBalance, decimals);
      } catch {
        // Fall back to OKX's indexed amount when direct ERC-20 reads fail.
      }

      const currentPrice = readNumber(asset.tokenPrice ?? asset.price ?? 0, 0);
      return {
        tokenAddress,
        tokenSymbol: asset.symbol ?? asset.tokenSymbol ?? tokenAddress.slice(0, 6),
        amount,
        entryPrice: currentPrice,
        currentPrice,
        pnlPercent: 0,
        pnlUsd: 0,
        lastSecurityCheck: 0,
        lastVerdictLevel: 'CAUTION',
      } satisfies Position;
    })))
    .filter((position) => position.amount > 0);

  return { walletBalance: balances.usdt, positions };
}

export async function fetchTokenPrice(tokenAddress: string): Promise<number | null> {
  // Prefer the Market API price-info endpoint - it's cheaper than a quote
  // and returns a native USD price regardless of current quote liquidity.
  const marketInfo = await getMarketPriceInfo([tokenAddress]);
  const first = marketInfo[0];
  if (first?.price) {
    const price = readNumber(first.price, NaN);
    if (Number.isFinite(price) && price > 0) {
      return price;
    }
  }

  // Fallback: ask the aggregator for a live quote and derive the implicit price.
  const decimals = await getTokenDecimals(tokenAddress);
  const quote = await getAggregatorQuote({
    fromTokenAddress: tokenAddress,
    toTokenAddress: XLAYER_TOKENS.USDT,
    amount: toBaseUnits(1, decimals),
    slippage: '5',
  });

  if (quote?.fromToken?.tokenUnitPrice) {
    const unitPrice = readNumber(quote.fromToken.tokenUnitPrice, NaN);
    if (Number.isFinite(unitPrice) && unitPrice > 0) {
      return unitPrice;
    }
  }

  if (quote?.toTokenAmount) {
    const usdtOut = fromBaseUnits(quote.toTokenAmount, 6);
    return usdtOut > 0 ? usdtOut : null;
  }

  return null;
}

/**
 * Pull the latest signals from OKX's Market API and convert them into the
 * internal TradeOpportunity shape consumed by the Scout loop. We query
 * Smart Money, Whale, and KOL signals because they're the three wallet
 * categories OKX exposes via /signal/list. `signalStrength` is derived from
 * the USD size of the triggering transaction (clamped 0..100) and biased by
 * the number of distinct wallets in agreement.
 */
export async function fetchSignalFeed(): Promise<TradeOpportunity[]> {
  const walletTypeToSignalType: Record<string, TradeOpportunity['signalType']> = {
    '1': 'smart-money',
    '2': 'kol',
    '3': 'volume-spike', // map Whale signals onto our existing 'volume-spike' type
  };

  const deduped = new Map<string, TradeOpportunity>();
  const skippedTokenAddresses = new Set([
    XLAYER_TOKENS.USDT.toLowerCase(),
    XLAYER_TOKENS.XLAYER_USDT.toLowerCase(),
    XLAYER_TOKENS.USDC.toLowerCase(),
    XLAYER_TOKENS.WOKB.toLowerCase(),
    XLAYER_TOKENS.OKB.toLowerCase(),
    XLAYER_TOKENS.WETH.toLowerCase(),
  ]);

  const signals = await getMarketSignalList({ walletType: '1,2,3', limit: 50 });
  for (const signal of signals) {
    const tokenAddress = signal.token?.tokenContractAddress ?? signal.token?.tokenAddress ?? '';
    if (!tokenAddress) {
      continue;
    }

    // Skip USDT / WOKB / base tokens - we trade _into_ those, not _from_.
    const lowered = tokenAddress.toLowerCase();
    if (skippedTokenAddresses.has(lowered)) {
      continue;
    }

    const amountUsd = Number(signal.amountUsd ?? 0);
    const walletCount = Number(signal.triggerWalletCount ?? 1);
    const soldRatio = Number(signal.soldRatioPercent ?? 0);

    // Ignore sell-side signals - they're not buy opportunities.
    if (Number.isFinite(soldRatio) && soldRatio > 50) {
      continue;
    }

    // Simple score: USD size (log-scaled) plus wallet-count weight, clamped.
    const sizeScore = Number.isFinite(amountUsd) && amountUsd > 0
      ? Math.min(80, 40 + Math.log10(Math.max(1, amountUsd)) * 10)
      : 40;
    const countBoost = Number.isFinite(walletCount) && walletCount > 1
      ? Math.min(20, walletCount * 2)
      : 0;
    const signalStrength = Math.round(Math.max(0, Math.min(100, sizeScore + countBoost)));
    const walletType = String(signal.walletType ?? '3');

    const candidate: TradeOpportunity = {
      tokenAddress,
      tokenSymbol: signal.token?.symbol ?? tokenAddress.slice(0, 6),
      signalType: walletTypeToSignalType[walletType] ?? 'volume-spike',
      signalStrength,
      currentPrice: Number(signal.price ?? 0),
    };

    const current = deduped.get(tokenAddress);
    if (!current || candidate.signalStrength > current.signalStrength) {
      deduped.set(tokenAddress, candidate);
    }
  }

  if (deduped.size === 0) {
    const topTokens = await getMarketTokenTopList(50);
    for (const token of topTokens) {
      const tokenAddress = token.tokenContractAddress ?? '';
      if (!tokenAddress || skippedTokenAddresses.has(tokenAddress.toLowerCase())) {
        continue;
      }

      const volume = readNumber(token.volume, 0);
      const liquidity = readNumber(token.liquidity, 0);
      const uniqueTraders = readNumber(token.uniqueTraders, 0);
      const txsBuy = readNumber(token.txsBuy, 0);
      const txsSell = readNumber(token.txsSell, 0);
      const change = readNumber(token.change, 0);
      const totalDirectionalTxs = txsBuy + txsSell;
      const buyRatio = totalDirectionalTxs > 0 ? txsBuy / totalDirectionalTxs : 0.5;

      if (liquidity > 0 && liquidity < 10_000) {
        continue;
      }

      const volumeScore = volume > 0 ? Math.min(45, Math.log10(Math.max(1, volume)) * 8) : 20;
      const traderScore = Math.min(20, uniqueTraders);
      const buyPressureScore = Math.max(-15, Math.min(15, (buyRatio - 0.5) * 60));
      const momentumScore = Math.max(-10, Math.min(20, change));
      const signalStrength = Math.round(Math.max(0, Math.min(100, 30 + volumeScore + traderScore + buyPressureScore + momentumScore)));

      const candidate: TradeOpportunity = {
        tokenAddress,
        tokenSymbol: token.tokenSymbol ?? tokenAddress.slice(0, 6),
        signalType: 'volume-spike',
        signalStrength,
        currentPrice: readNumber(token.price, 0),
      };

      const current = deduped.get(tokenAddress);
      if (!current || candidate.signalStrength > current.signalStrength) {
        deduped.set(tokenAddress, candidate);
      }
    }
  }

  return [...deduped.values()].sort((left, right) => right.signalStrength - left.signalStrength);
}
