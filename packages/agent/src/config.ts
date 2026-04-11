import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import type { AgentConfig } from './types.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(currentDir, '../../../.env'),
];

for (const envPath of candidateEnvPaths) {
  dotenv.config({ path: envPath, override: false });
}

type RiskTolerance = AgentConfig['riskTolerance'];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseNumber(name: string, fallback?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required numeric environment variable: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric environment variable: ${name}=${raw}`);
  }
  return value;
}

function parseRiskTolerance(raw: string | undefined): RiskTolerance {
  if (raw === 'conservative' || raw === 'moderate' || raw === 'aggressive') {
    return raw;
  }
  return 'moderate';
}

export interface AppEnv {
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
  agentWalletAddress: string;
  agentChainId: string;
  x402PricePerCheck: number;
  port: number;
  enableMcp: boolean;
  mcpTransport: 'stdio' | 'disabled';
}

export const agentConfig: AgentConfig = {
  riskTolerance: parseRiskTolerance(process.env.RISK_TOLERANCE),
  scanIntervalMs: parseNumber('SCAN_INTERVAL_MS', 60_000),
  monitorIntervalMs: parseNumber('MONITOR_INTERVAL_MS', 120_000),
  maxPositionSizeUsdt: parseNumber('MAX_POSITION_SIZE_USDT', 50),
  maxPortfolioSizeUsdt: parseNumber('MAX_PORTFOLIO_SIZE_USDT', 500),
};

export const env: AppEnv = {
  okxApiKey: requireEnv('OKX_API_KEY'),
  okxSecretKey: requireEnv('OKX_SECRET_KEY'),
  okxPassphrase: requireEnv('OKX_PASSPHRASE'),
  agentWalletAddress: requireEnv('AGENT_WALLET_ADDRESS'),
  agentChainId: process.env.AGENT_CHAIN_ID || '196',
  x402PricePerCheck: parseNumber('X402_PRICE_PER_CHECK', 0.005),
  port: parseNumber('PORT', 3001),
  enableMcp: (process.env.ENABLE_MCP || 'false').toLowerCase() === 'true',
  mcpTransport: (process.env.MCP_TRANSPORT || 'stdio') === 'stdio' ? 'stdio' : 'disabled',
};
