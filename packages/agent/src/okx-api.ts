import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

import { OKXDexClient } from '@okx-dex/okx-dex-sdk';
import { createEVMWallet } from '@okx-dex/okx-dex-sdk/dist/core/evm-wallet.js';
import { ethers } from 'ethers';

import { env } from './config.js';
import type { Position, TradeOpportunity } from './types.js';

export const XLAYER_CHAIN_ID = '196';
export const XLAYER_RPC_FALLBACK = 'https://xlayerrpc.okx.com';
export const OKX_WEB3_BASE_URL = 'https://web3.okx.com';
export const OKX_AGGREGATOR_BASE_PATH = '/api/v5/dex/aggregator';
export const DEFAULT_SLIPPAGE = '0.01';

export const XLAYER_TOKENS = {
  OKB: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  WOKB: '0x75E1AB5E0e3BA13b3520349F069350441CF53c0A',
  WETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  USDT: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
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

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

function coerceRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return readArray(value);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return readArray(record.data ?? record.items ?? record.list ?? record.results ?? record.holders ?? record.tokens ?? [record]);
  }
  return [];
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

export function onchainos(command: string): any {
  try {
    const out = execSync(`onchainos ${command} --output json 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 15_000,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

export function callOnchainosCli(command: string): any {
  return onchainos(command);
}

export async function callOkxRest<T>(
  method: 'GET' | 'POST',
  pathWithQuery: string,
  body?: object,
  retries = 2,
): Promise<OkxEnvelope<T> | null> {
  if (!hasLiveCredentials()) {
    return null;
  }

  const [requestPath, rawQuery = ''] = pathWithQuery.split('?');
  const queryString = rawQuery ? `?${rawQuery}` : '';
  const bodyStr = body ? JSON.stringify(body) : '';

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const timestamp = new Date().toISOString();
      const signaturePayload = method === 'GET' ? queryString : bodyStr;
      const response = await fetch(`${OKX_WEB3_BASE_URL}${requestPath}${queryString}`, {
        method,
        headers: getHeaders(timestamp, method, requestPath, signaturePayload),
        body: method === 'GET' ? undefined : bodyStr,
      });

      if (!response.ok) {
        console.error(`[OKX REST] ${response.status} ${method} ${requestPath}${queryString}`);
      } else {
        const json = await response.json() as OkxEnvelope<T>;
        if (json.code === '0') {
          return json;
        }
        console.error(`[OKX REST] Error ${json.code}: ${json.msg} for ${requestPath}${queryString}`);
      }
    } catch (error) {
      console.error(`[OKX REST] Network error for ${requestPath}${queryString}:`, error);
    }

    if (attempt < retries - 1) {
      await sleep(1000 * (2 ** attempt));
    }
  }

  return null;
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
    `${OKX_AGGREGATOR_BASE_PATH}/all-tokens${toQueryString({ chainId: env.agentChainId })}`,
  );

  return response?.data ?? [];
}

export async function getTokenMetadata(tokenAddress: string): Promise<TokenInfo | null> {
  const normalized = tokenAddress.toLowerCase();
  const tokens = await getAllTokens();
  return tokens.find((token) => token.tokenContractAddress?.toLowerCase() === normalized) ?? null;
}

export async function getTokenDecimals(tokenAddress: string, fallback = 18): Promise<number> {
  if (tokenAddress.toLowerCase() === XLAYER_TOKENS.USDT.toLowerCase()) {
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
      chainId: env.agentChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippage: params.slippage ?? DEFAULT_SLIPPAGE,
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
      chainId: env.agentChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippage: params.slippage ?? DEFAULT_SLIPPAGE,
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
      chainId: env.agentChainId,
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

export async function getWalletOnchainBalances(walletAddress: string): Promise<{ okb: number; usdt: number }> {
  if (!walletAddress || walletAddress === '0x0000000000000000000000000000000000000196') {
    return { okb: 0, usdt: 0 };
  }

  try {
    const currentProvider = getProvider();
    const [okbRaw, usdtRaw] = await Promise.all([
      currentProvider.getBalance(walletAddress),
      new ethers.Contract(XLAYER_TOKENS.USDT, ERC20_ABI, currentProvider).balanceOf(walletAddress) as Promise<bigint>,
    ]);

    return {
      okb: Number(ethers.formatEther(okbRaw)),
      usdt: Number(ethers.formatUnits(usdtRaw, 6)),
    };
  } catch (error) {
    console.warn('[X Layer] Could not read wallet balances:', error);
    return { okb: 0, usdt: 0 };
  }
}

export async function fetchWalletBalances(walletAddress: string): Promise<{ walletBalance: number; positions: Position[] }> {
  const balances = await getWalletOnchainBalances(walletAddress);
  const cliPortfolio = onchainos(`wallet portfolio tokens --address ${walletAddress} --chain xlayer`);
  const items = coerceRecords(cliPortfolio);

  const positions = items
    .filter((item) => {
      const address = readString(item.tokenAddress ?? item.address ?? item.contractAddress);
      return address && address.toLowerCase() !== XLAYER_TOKENS.USDT.toLowerCase();
    })
    .map((item) => {
      const tokenAddress = readString(item.tokenAddress ?? item.address ?? item.contractAddress);
      const currentPrice = readNumber(item.priceUsd ?? item.currentPrice ?? item.tokenUnitPrice);
      return {
        tokenAddress,
        tokenSymbol: readString(item.tokenSymbol ?? item.symbol, tokenAddress.slice(0, 6)),
        amount: readNumber(item.balance ?? item.amount ?? item.tokenAmount),
        entryPrice: currentPrice,
        currentPrice,
        pnlPercent: readNumber(item.pnlPercent),
        pnlUsd: readNumber(item.pnlUsd),
        lastSecurityCheck: 0,
        lastVerdictLevel: 'CAUTION' as const,
      };
    });

  return { walletBalance: balances.usdt, positions };
}

export async function fetchTokenPrice(tokenAddress: string): Promise<number | null> {
  const decimals = await getTokenDecimals(tokenAddress);
  const quote = await getAggregatorQuote({
    fromTokenAddress: tokenAddress,
    toTokenAddress: XLAYER_TOKENS.USDT,
    amount: toBaseUnits(1, decimals),
    slippage: '0.05',
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

  const cliPrice = onchainos(`dex market price --chain xlayer --token-address ${tokenAddress}`);
  const price = readNumber(cliPrice?.price ?? cliPrice?.data?.price ?? cliPrice?.result?.price, NaN);
  return Number.isFinite(price) ? price : null;
}

export async function fetchSignalFeed(): Promise<TradeOpportunity[]> {
  const signalConfigs: Array<{ signalType: TradeOpportunity['signalType']; command: string }> = [
    { signalType: 'smart-money', command: 'dex signal --chain xlayer --type smart-money' },
    { signalType: 'kol', command: 'dex signal --chain xlayer --type kol' },
    { signalType: 'volume-spike', command: 'dex signal --chain xlayer --type volume-spike' },
    { signalType: 'new-launch', command: 'dex trenches new-launches --chain xlayer' },
  ];

  const deduped = new Map<string, TradeOpportunity>();

  for (const config of signalConfigs) {
    const payload = onchainos(config.command);
    const items = coerceRecords(payload);
    for (const item of items) {
      const tokenAddress = readString(item.tokenAddress ?? item.address ?? item.contractAddress);
      if (!tokenAddress) {
        continue;
      }

      const candidate: TradeOpportunity = {
        tokenAddress,
        tokenSymbol: readString(item.tokenSymbol ?? item.symbol, tokenAddress.slice(0, 6)),
        signalType: config.signalType,
        signalStrength: readNumber(item.signalStrength ?? item.score ?? item.confidence, 50),
        currentPrice: readNumber(item.currentPrice ?? item.priceUsd ?? item.price, 0),
      };
      const current = deduped.get(tokenAddress);
      if (!current || candidate.signalStrength > current.signalStrength) {
        deduped.set(tokenAddress, candidate);
      }
    }
  }

  return [...deduped.values()].sort((left, right) => right.signalStrength - left.signalStrength);
}
