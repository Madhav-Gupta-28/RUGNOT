import { Buffer } from 'node:buffer';

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import type { StateStore } from './state.js';
import type { X402Transaction } from './types.js';

const X402_VERSION = 1;
const USDC_DECIMALS = 6;

type SupportedX402Network =
  | 'base'
  | 'base-sepolia'
  | 'polygon'
  | 'polygon-amoy'
  | 'avalanche'
  | 'avalanche-fuji'
  | 'sei'
  | 'sei-testnet'
  | 'iotex'
  | 'abstract'
  | 'abstract-testnet'
  | 'story'
  | 'educhain'
  | 'peaq'
  | 'skale-base-sepolia';

interface X402AssetConfig {
  asset: `0x${string}`;
  name: string;
  version: string;
}

interface X402PaymentRequirement {
  scheme: 'exact';
  network: SupportedX402Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  asset: `0x${string}`;
  outputSchema: Record<string, unknown>;
  extra: {
    name: string;
    version: string;
  };
}

interface X402PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: SupportedX402Network;
  payload: {
    signature: `0x${string}`;
    authorization: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: `0x${string}`;
    };
  };
}

interface FacilitatorVerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

interface FacilitatorSettleResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
}

const X402_ASSETS: Record<SupportedX402Network, X402AssetConfig> = {
  base: {
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    name: 'USD Coin',
    version: '2',
  },
  'base-sepolia': {
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    name: 'USDC',
    version: '2',
  },
  polygon: {
    asset: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    name: 'USD Coin',
    version: '2',
  },
  'polygon-amoy': {
    asset: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    name: 'USDC',
    version: '2',
  },
  avalanche: {
    asset: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    name: 'USD Coin',
    version: '2',
  },
  'avalanche-fuji': {
    asset: '0x5425890298aed601595a70AB815c96711a31Bc65',
    name: 'USD Coin',
    version: '2',
  },
  sei: {
    asset: '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392',
    name: 'USDC',
    version: '2',
  },
  'sei-testnet': {
    asset: '0x4fcf1784b31630811181f670aea7a7bef803eaed',
    name: 'USDC',
    version: '2',
  },
  iotex: {
    asset: '0xcdf79194c6c285077a58da47641d4dbe51f63542',
    name: 'Bridged USDC',
    version: '2',
  },
  abstract: {
    asset: '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1',
    name: 'Bridged USDC',
    version: '2',
  },
  'abstract-testnet': {
    asset: '0xe4C7fBB0a626ed208021ccabA6Be1566905E2dFc',
    name: 'Bridged USDC',
    version: '2',
  },
  story: {
    asset: '0xF1815bd50389c46847f0Bda824eC8da914045D14',
    name: 'Bridged USDC',
    version: '2',
  },
  educhain: {
    asset: '0x12a272A581feE5577A5dFa371afEB4b2F3a8C2F8',
    name: 'Bridged USDC (Stargate)',
    version: '2',
  },
  peaq: {
    asset: '0xbbA60da06c2c5424f03f7434542280FCAd453d10',
    name: 'USDC',
    version: '2',
  },
  'skale-base-sepolia': {
    asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
    name: 'Bridged USDC (SKALE Bridge)',
    version: '2',
  },
};

function isEvmAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isSupportedNetwork(value: string): value is SupportedX402Network {
  return Object.prototype.hasOwnProperty.call(X402_ASSETS, value);
}

function resolveNetwork(): SupportedX402Network {
  if (isSupportedNetwork(env.x402Network)) {
    return env.x402Network;
  }

  console.warn(`[x402] Unsupported X402_NETWORK=${env.x402Network}; falling back to base.`);
  return 'base';
}

function priceToUsdcUnits(priceUsd: number): string {
  return String(Math.max(1, Math.round(priceUsd * (10 ** USDC_DECIMALS))));
}

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

function parseBase64Json(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(normalized, 'base64').toString('utf8');
  return JSON.parse(decoded) as unknown;
}

function isPaymentPayload(value: unknown): value is X402PaymentPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<X402PaymentPayload>;
  const payload = candidate.payload;
  const authorization = payload?.authorization;
  return (
    candidate.x402Version === X402_VERSION &&
    candidate.scheme === 'exact' &&
    typeof candidate.network === 'string' &&
    isSupportedNetwork(candidate.network) &&
    Boolean(payload) &&
    typeof payload?.signature === 'string' &&
    payload.signature.startsWith('0x') &&
    Boolean(authorization) &&
    typeof authorization?.from === 'string' &&
    isEvmAddress(authorization.from) &&
    typeof authorization.to === 'string' &&
    isEvmAddress(authorization.to) &&
    typeof authorization.value === 'string' &&
    typeof authorization.validAfter === 'string' &&
    typeof authorization.validBefore === 'string' &&
    typeof authorization.nonce === 'string' &&
    /^0x[a-fA-F0-9]{64}$/.test(authorization.nonce)
  );
}

function getResourceUrl(req: Request): string {
  const protocol = req.header('x-forwarded-proto') || req.protocol;
  const host = req.header('x-forwarded-host') || req.header('host') || `localhost:${env.port}`;
  return `${protocol}://${host}${req.originalUrl}`;
}

function buildPaymentRequirement(req: Request, payTo: `0x${string}`): X402PaymentRequirement {
  const network = resolveNetwork();
  const asset = X402_ASSETS[network];

  return {
    scheme: 'exact',
    network,
    maxAmountRequired: priceToUsdcUnits(env.x402PricePerCheck),
    resource: getResourceUrl(req),
    description: 'RUGNOT 5-layer X Layer token security verdict',
    mimeType: 'application/json',
    payTo,
    maxTimeoutSeconds: 60,
    asset: asset.asset,
    outputSchema: {
      input: {
        type: 'http',
        method: 'POST',
        discoverable: true,
        bodyType: 'json',
        bodyFields: {
          tokenAddress: 'X Layer token contract address',
          chainId: env.agentChainId,
        },
      },
      output: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string' },
          chain: { type: 'string' },
          level: { type: 'string' },
          score: { type: 'number' },
          checks: { type: 'array' },
        },
      },
    },
    extra: {
      name: asset.name,
      version: asset.version,
    },
  };
}

function paymentRequired(res: Response, requirement: X402PaymentRequirement, error: string, payer?: string) {
  return res.status(402).json({
    x402Version: X402_VERSION,
    error,
    accepts: [requirement],
    ...(payer ? { payer } : {}),
  });
}

async function postFacilitator<T>(endpoint: 'verify' | 'settle', payload: X402PaymentPayload, requirement: X402PaymentRequirement): Promise<T> {
  const response = await fetch(`${env.x402FacilitatorUrl.replace(/\/+$/, '')}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: payload.x402Version,
      paymentPayload: payload,
      paymentRequirements: requirement,
    }),
  });

  const data = await response.json().catch(async () => ({
    error: await response.text().catch(() => response.statusText),
  })) as T & { error?: string };

  if (!response.ok) {
    const message = data.error || `${endpoint} failed with ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return data;
}

async function verifyPayment(req: Request, res: Response, requirement: X402PaymentRequirement): Promise<X402PaymentPayload | null> {
  const paymentHeader = req.header('X-PAYMENT');
  if (!paymentHeader) {
    paymentRequired(res, requirement, 'X-PAYMENT header is required');
    return null;
  }

  let paymentPayload: X402PaymentPayload;
  try {
    const decoded = parseBase64Json(paymentHeader);
    if (!isPaymentPayload(decoded)) {
      throw new Error('Invalid or malformed payment header');
    }
    paymentPayload = decoded;
  } catch (error) {
    paymentRequired(res, requirement, error instanceof Error ? error.message : 'Invalid or malformed payment header');
    return null;
  }

  if (paymentPayload.network !== requirement.network) {
    paymentRequired(res, requirement, 'Unable to find matching payment requirements', paymentPayload.payload.authorization.from);
    return null;
  }

  try {
    const verification = await postFacilitator<FacilitatorVerifyResponse>('verify', paymentPayload, requirement);
    if (!verification.isValid) {
      paymentRequired(
        res,
        requirement,
        verification.invalidReason || 'Payment verification failed',
        verification.payer,
      );
      return null;
    }
  } catch (error) {
    paymentRequired(res, requirement, error instanceof Error ? error.message : 'Payment verification failed');
    return null;
  }

  return paymentPayload;
}

async function settlePayment(res: Response, requirement: X402PaymentRequirement, payload: X402PaymentPayload): Promise<FacilitatorSettleResponse | null> {
  try {
    const settlement = await postFacilitator<FacilitatorSettleResponse>('settle', payload, requirement);
    if (!settlement.success) {
      paymentRequired(res, requirement, settlement.errorReason || 'Payment settlement failed', settlement.payer);
      return null;
    }
    res.setHeader('X-PAYMENT-RESPONSE', base64Json(settlement));
    return settlement;
  } catch (error) {
    paymentRequired(res, requirement, error instanceof Error ? error.message : 'Payment settlement failed');
    return null;
  }
}

function recordSettledPayment(state: StateStore) {
  const payment: X402Transaction = {
    id: uuidv4(),
    direction: 'earned',
    amount: env.x402PricePerCheck,
    service: `security-check:${resolveNetwork()}`,
    timestamp: Date.now(),
  };
  state.addX402Transaction(payment);
}

export function createX402Router(state: StateStore): Router {
  const router = Router();
  const payTo = env.x402PayTo || env.agentWalletAddress;
  const x402Misconfigured = env.x402Enabled && !isEvmAddress(payTo);

  if (env.x402Enabled && x402Misconfigured) {
    console.warn('[x402] Disabled paid security endpoint because X402_PAY_TO is not a valid EVM address.');
  }

  router.post('/api/v1/security/check', async (req, res) => {
    if (x402Misconfigured) {
      return res.status(503).json({
        error: 'x402_misconfigured',
        message: 'Paid security checks are enabled, but X402_PAY_TO is not a valid EVM address.',
      });
    }

    const tokenAddress = typeof req.body?.tokenAddress === 'string' ? req.body.tokenAddress : '';
    const chainId = req.body?.chainId ? String(req.body.chainId) : env.agentChainId;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    if (chainId !== env.agentChainId) {
      return res.status(400).json({ error: `Unsupported chainId ${chainId}. Expected ${env.agentChainId}.` });
    }

    const requirement = isEvmAddress(payTo) ? buildPaymentRequirement(req, payTo) : null;
    const paymentPayload = env.x402Enabled && requirement
      ? await verifyPayment(req, res, requirement)
      : null;

    if (env.x402Enabled && !paymentPayload) {
      return undefined;
    }

    const verdict = await vetToken(tokenAddress);
    state.addVerdict(verdict);

    if (env.x402Enabled && requirement && paymentPayload) {
      const settlement = await settlePayment(res, requirement, paymentPayload);
      if (!settlement) {
        return undefined;
      }
      recordSettledPayment(state);
    }

    return res.json(verdict);
  });

  return router;
}
