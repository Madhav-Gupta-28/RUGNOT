import 'dotenv/config';

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

import { config as loadEnv } from 'dotenv';
import { createPublicClient, formatUnits, http, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalanche, avalancheFuji, base, baseSepolia, polygon, polygonAmoy } from 'viem/chains';

const ENV_PATHS = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(import.meta.dirname, '../../../.env'),
];

for (const envPath of ENV_PATHS) {
  loadEnv({ path: envPath, override: false });
}

const DEFAULT_ENDPOINT = 'http://localhost:3001/api/v1/security/check';
const DEFAULT_TEST_TOKEN = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';
const DEFAULT_MAX_USDC = '0.02';
const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

type PaymentRequirement = {
  scheme: 'exact';
  network: string;
  asset: `0x${string}`;
  maxAmountRequired: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
  };
};

function readEnv(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function parseUsdcAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error(`${value} is not a valid USDC amount. Use up to 6 decimals.`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function chainForNetwork(network: string): Chain | null {
  switch (network) {
    case 'base':
      return base;
    case 'base-sepolia':
      return baseSepolia;
    case 'polygon':
      return polygon;
    case 'polygon-amoy':
      return polygonAmoy;
    case 'avalanche':
      return avalanche;
    case 'avalanche-fuji':
      return avalancheFuji;
    default:
      return null;
  }
}

function firstPaymentRequirement(challenge: unknown, preferredNetwork: string): PaymentRequirement | null {
  if (!challenge || typeof challenge !== 'object') {
    return null;
  }
  const accepts = (challenge as { accepts?: unknown }).accepts;
  if (!Array.isArray(accepts)) {
    return null;
  }

  const candidates = accepts.filter((item): item is PaymentRequirement => {
    const candidate = item as Partial<PaymentRequirement>;
    return (
      Boolean(candidate) &&
      candidate.scheme === 'exact' &&
      typeof candidate.network === 'string' &&
      typeof candidate.asset === 'string' &&
      candidate.asset.startsWith('0x') &&
      typeof candidate.maxAmountRequired === 'string' &&
      typeof candidate.payTo === 'string' &&
      candidate.payTo.startsWith('0x') &&
      typeof candidate.maxTimeoutSeconds === 'number'
    );
  });

  return candidates.find((candidate) => candidate.network === preferredNetwork) ?? candidates[0] ?? null;
}

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

function decodeBase64Json(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as unknown;
}

async function assertBuyerCanPay(privateKey: Hex, requirement: PaymentRequirement) {
  const chain = chainForNetwork(requirement.network);
  if (!chain) {
    throw new Error(`No local viem chain mapping for ${requirement.network}. Use Base for the x402 proof script.`);
  }

  const account = privateKeyToAccount(privateKey);
  const client = createPublicClient({ chain, transport: http() });
  const balance = await client.readContract({
    address: requirement.asset,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  const required = BigInt(requirement.maxAmountRequired);

  console.log(`[x402 proof] Buyer: ${account.address}`);
  console.log(`[x402 proof] Buyer USDC balance on ${requirement.network}: ${formatUnits(balance, 6)}; required: ${formatUnits(required, 6)}`);

  if (balance < required) {
    throw new Error(`Buyer wallet has insufficient USDC on ${requirement.network}. Fund at least ${formatUnits(required, 6)} USDC, then rerun.`);
  }
}

async function createPaymentHeader(privateKey: Hex, requirement: PaymentRequirement, maxPayment: bigint): Promise<string> {
  const chain = chainForNetwork(requirement.network);
  if (!chain) {
    throw new Error(`No local viem chain mapping for ${requirement.network}. Use Base for the x402 proof script.`);
  }

  const required = BigInt(requirement.maxAmountRequired);
  if (required > maxPayment) {
    throw new Error(`Payment amount ${formatUnits(required, 6)} USDC exceeds X402_MAX_PAYMENT_USDC=${formatUnits(maxPayment, 6)}.`);
  }

  const account = privateKeyToAccount(privateKey);
  const now = Math.floor(Date.now() / 1000);
  const validAfter = String(now - 600);
  const validBefore = String(now + requirement.maxTimeoutSeconds);
  const nonce = `0x${crypto.randomBytes(32).toString('hex')}` as Hex;
  const authorization = {
    from: account.address,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await account.signTypedData({
    domain: {
      name: requirement.extra?.name ?? 'USD Coin',
      version: requirement.extra?.version ?? '2',
      chainId: chain.id,
      verifyingContract: requirement.asset,
    },
    types: AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  return encodeBase64Json({
    x402Version: 1,
    scheme: 'exact',
    network: requirement.network,
    payload: {
      signature,
      authorization,
    },
  });
}

async function main() {
  const endpoint = readEnv('X402_API_URL', DEFAULT_ENDPOINT);
  const network = readEnv('X402_BUYER_NETWORK', readEnv('X402_NETWORK', 'base'));
  const privateKey = readEnv('X402_BUYER_PRIVATE_KEY', readEnv('PRIVATE_KEY'));
  const tokenAddress = readEnv('X402_TEST_TOKEN_ADDRESS', DEFAULT_TEST_TOKEN);
  const maxUsdc = readEnv('X402_MAX_PAYMENT_USDC', DEFAULT_MAX_USDC);

  if (!privateKey) {
    throw new Error('Set X402_BUYER_PRIVATE_KEY to a wallet funded with USDC on the x402 network before proving a real paid request.');
  }

  const body = JSON.stringify({ tokenAddress, chainId: '196' });
  const plainResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const challenge = await plainResponse.clone().json().catch(async () => ({ raw: await plainResponse.text() }));
  console.log(`[x402 proof] Plain request status: ${plainResponse.status}`);
  console.log(`[x402 proof] Challenge/body: ${safeJson(challenge)}`);

  if (plainResponse.ok) {
    console.log('[x402 proof] Endpoint returned 2xx without payment. X402_ENABLED may be false, so this does not prove a paid request.');
    return;
  }

  if (plainResponse.status !== 402) {
    throw new Error(`Expected 402 Payment Required before paying, got ${plainResponse.status}.`);
  }

  const privateKeyHex = privateKey as Hex;
  const requirement = firstPaymentRequirement(challenge, network);
  if (!requirement) {
    throw new Error('No supported exact EVM x402 payment requirement found in 402 challenge.');
  }

  await assertBuyerCanPay(privateKeyHex, requirement);

  const paymentHeader = await createPaymentHeader(privateKeyHex, requirement, parseUsdcAmount(maxUsdc));
  const paidResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': paymentHeader,
      'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
    },
    body,
  });

  const paymentResponseHeader = paidResponse.headers.get('X-PAYMENT-RESPONSE');
  const payload = await paidResponse.clone().json().catch(async () => ({ raw: await paidResponse.text() }));
  console.log(`[x402 proof] Paid request status: ${paidResponse.status}`);
  console.log(`[x402 proof] Paid response body: ${safeJson(payload)}`);

  if (paymentResponseHeader) {
    console.log(`[x402 proof] X-PAYMENT-RESPONSE: ${safeJson(decodeBase64Json(paymentResponseHeader))}`);
  } else {
    console.log('[x402 proof] No X-PAYMENT-RESPONSE header returned.');
  }

  if (!paidResponse.ok) {
    throw new Error(`Paid x402 request failed with status ${paidResponse.status}.`);
  }

  console.log('[x402 proof] Real x402 paid request completed.');
}

main().catch((error) => {
  console.error('[x402 proof] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
