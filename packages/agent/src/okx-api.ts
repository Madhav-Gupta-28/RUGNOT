import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

import { env } from './config.js';
import type { Position, TradeOpportunity } from './types.js';

const OKX_BASE_URL = 'https://www.okx.com';

interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T;
}

export interface CallOkxApiOptions<T> {
  cliCommand?: string;
  mapCliResult?: (value: unknown) => T | null;
  retries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOkxHeaders(method: string, path: string, body?: string): Record<string, string> {
  const timestamp = new Date().toISOString();
  const prehash = timestamp + method.toUpperCase() + path + (body || '');
  const signature = crypto.createHmac('sha256', env.okxSecretKey)
    .update(prehash).digest('base64');
  return {
    'OK-ACCESS-KEY': env.okxApiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': env.okxPassphrase,
    'Content-Type': 'application/json',
  };
}

async function callOkxApiOnce<T>(method: string, path: string, body?: object): Promise<T | null> {
  try {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const res = await fetch(`${OKX_BASE_URL}${path}`, {
      method,
      headers: getOkxHeaders(method, path, bodyStr),
      body: bodyStr,
    });
    if (!res.ok) {
      console.error(`[OKX] ${res.status} for ${path}`);
      return null;
    }
    const json = await res.json() as OkxEnvelope<T>;
    if (json.code !== '0') {
      console.error(`[OKX] Error ${json.code}: ${json.msg} for ${path}`);
      return null;
    }
    return json.data as T;
  } catch (err) {
    console.error(`[OKX] Network error for ${path}:`, err);
    return null;
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function maybeShellEscape(value: string): string {
  return /^[a-zA-Z0-9._:/=-]+$/.test(value) ? value : shellEscape(value);
}

function normalizeResult<T>(value: T | T[] | null): T | T[] | null {
  if (Array.isArray(value) && value.length === 1) {
    return value[0] ?? null;
  }
  return value;
}

function deriveCliCommand(method: string, path: string, body?: object): string | null {
  try {
    const url = new URL(`${OKX_BASE_URL}${path}`);
    const endpoint = url.pathname.replace(/^\/api\/v5\//, '');
    if (!endpoint) {
      return null;
    }
    const parts: string[] = endpoint.split('/').filter(Boolean);
    url.searchParams.forEach((value, key) => {
      parts.push(`--${key}`, value);
    });
    if (method.toUpperCase() !== 'GET' && body) {
      for (const [key, value] of Object.entries(body)) {
        parts.push(`--${key}`, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
    return parts.map(maybeShellEscape).join(' ');
  } catch {
    return null;
  }
}

export function callOnchainosCli(command: string): any {
  try {
    const output = execSync(`onchainos ${command} --output json`, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch { return null; }
}

export async function callOkxApi<T>(
  method: string,
  path: string,
  body?: object,
  options: CallOkxApiOptions<T> = {},
): Promise<T | null> {
  const retries = options.retries ?? 3;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const result = await callOkxApiOnce<T | T[]>(method, path, body);
    if (result !== null) {
      return normalizeResult(result) as T;
    }
    if (attempt < retries - 1) {
      const delayMs = 1000 * (2 ** attempt);
      console.warn(`[OKX] backing off for ${delayMs}ms before retrying ${path}`);
      await sleep(delayMs);
    }
  }

  const cliCommand = options.cliCommand ?? deriveCliCommand(method, path, body);
  if (!cliCommand) {
    return null;
  }

  const cliResult = callOnchainosCli(cliCommand);
  if (!cliResult) {
    return null;
  }

  if (options.mapCliResult) {
    return options.mapCliResult(cliResult);
  }

  return normalizeResult((cliResult.data ?? cliResult.result ?? cliResult) as T | T[]) as T;
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
    return readArray(record.items ?? record.list ?? record.results ?? record.holders ?? record.tokens ?? [record]);
  }
  return [];
}

export async function fetchWalletBalances(walletAddress: string): Promise<{ walletBalance: number; positions: Position[] }> {
  const balances = await callOkxApi<Record<string, unknown>[]>(
    'GET',
    `/api/v5/wallet/asset/balances?chainId=${env.agentChainId}&walletAddress=${walletAddress}`,
    undefined,
    {
      cliCommand: `wallet asset balances --chainId ${env.agentChainId} --walletAddress ${walletAddress}`,
    },
  );

  const items = coerceRecords(balances);
  const walletBalance = items.reduce((sum, item) => sum + readNumber(item.balanceUsd), 0);
  const positions = items
    .filter((item) => readString(item.tokenAddress) !== '')
    .map((item) => {
      const currentPrice = readNumber(item.priceUsd);
      return {
        tokenAddress: readString(item.tokenAddress),
        tokenSymbol: readString(item.tokenSymbol, readString(item.symbol, 'UNKNOWN')),
        amount: readNumber(item.balance),
        entryPrice: currentPrice,
        currentPrice,
        pnlPercent: 0,
        pnlUsd: 0,
        lastSecurityCheck: 0,
        lastVerdictLevel: 'CAUTION' as const,
      };
    });

  return { walletBalance, positions };
}

export async function fetchTokenPrice(tokenAddress: string): Promise<number | null> {
  const data = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/market/token-price?chainId=${env.agentChainId}&tokenAddress=${tokenAddress}`,
  );

  if (!data) {
    return null;
  }

  return readNumber(data.price ?? data.lastPrice ?? data.close, NaN) || null;
}

export async function fetchSignalFeed(): Promise<TradeOpportunity[]> {
  const endpointConfigs: Array<{
    signalType: TradeOpportunity['signalType'];
    paths: string[];
    cliCommand?: string;
  }> = [
    {
      signalType: 'smart-money',
      paths: [
        `/api/v5/dex/signal/smart-money?chainId=${env.agentChainId}`,
        `/api/v5/dex/signal/discovery?chainId=${env.agentChainId}&type=smart-money`,
      ],
      cliCommand: `dex signal smart-money --chainId ${env.agentChainId}`,
    },
    {
      signalType: 'kol',
      paths: [
        `/api/v5/dex/signal/kol?chainId=${env.agentChainId}`,
        `/api/v5/dex/signal/discovery?chainId=${env.agentChainId}&type=kol`,
      ],
      cliCommand: `dex signal kol --chainId ${env.agentChainId}`,
    },
    {
      signalType: 'volume-spike',
      paths: [
        `/api/v5/dex/signal/volume-spike?chainId=${env.agentChainId}`,
        `/api/v5/dex/signal/discovery?chainId=${env.agentChainId}&type=volume-spike`,
      ],
      cliCommand: `dex signal volume-spike --chainId ${env.agentChainId}`,
    },
    {
      signalType: 'new-launch',
      paths: [
        `/api/v5/dex/trenches/new-launches?chainId=${env.agentChainId}`,
        `/api/v5/dex/signal/discovery?chainId=${env.agentChainId}&type=new-launch`,
      ],
      cliCommand: `dex trenches new-launches --chainId ${env.agentChainId}`,
    },
  ];

  const deduped = new Map<string, TradeOpportunity>();

  for (const config of endpointConfigs) {
    let payload: Record<string, unknown>[] | Record<string, unknown> | null = null;
    for (const path of config.paths) {
      payload = await callOkxApi<Record<string, unknown>[] | Record<string, unknown>>('GET', path, undefined, {
        cliCommand: config.cliCommand,
        retries: 1,
      });
      if (payload) {
        break;
      }
    }

    const items = coerceRecords(payload ?? []);
    for (const item of items) {
      const tokenAddress = readString(item.tokenAddress ?? item.address);
      if (!tokenAddress) {
        continue;
      }
      const signalStrength = readNumber(item.signalStrength ?? item.score ?? item.confidence, 50);
      const current = deduped.get(tokenAddress);
      const candidate: TradeOpportunity = {
        tokenAddress,
        tokenSymbol: readString(item.tokenSymbol ?? item.symbol, tokenAddress.slice(0, 6)),
        signalType: config.signalType,
        signalStrength,
        currentPrice: readNumber(item.currentPrice ?? item.priceUsd ?? item.price, 0),
      };

      if (!current || candidate.signalStrength > current.signalStrength) {
        deduped.set(tokenAddress, candidate);
      }
    }
  }

  return [...deduped.values()].sort((left, right) => right.signalStrength - left.signalStrength);
}
