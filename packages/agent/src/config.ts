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

let loadedEnvDir = '';
for (const envPath of candidateEnvPaths) {
  const result = dotenv.config({ path: envPath, override: false });
  if (!result.error && !loadedEnvDir) {
    loadedEnvDir = path.dirname(envPath);
  }
}

type RiskTolerance = AgentConfig['riskTolerance'];
type McpTransport = 'stdio' | 'http' | 'disabled';

function readEnv(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function resolveRuntimePath(name: string, fallback = ''): string {
  const raw = readEnv(name, fallback);
  if (!raw || path.isAbsolute(raw)) {
    return raw;
  }

  // npm workspaces run @rugnot/agent from packages/agent, but users edit the
  // root .env and expect relative paths there to resolve from the repo root.
  const baseDir = loadedEnvDir || process.env.INIT_CWD || process.cwd();
  return path.resolve(baseDir, raw);
}

function validateOkxEnv() {
  const hasAnyOkxCredential = Boolean(process.env.OKX_API_KEY || process.env.OKX_SECRET_KEY || process.env.OKX_PASSPHRASE);
  const hasAllOkxCredentials = Boolean(process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY && process.env.OKX_PASSPHRASE);

  if (hasAnyOkxCredential && !hasAllOkxCredentials) {
    throw new Error('OKX live mode requires OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE together.');
  }

  if (hasAllOkxCredentials && !process.env.OKX_PROJECT_ID) {
    throw new Error('OKX live mode requires OKX_PROJECT_ID. Get one from https://www.okx.com/web3/build/dev-portal.');
  }
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

function parseMcpTransport(raw: string | undefined): McpTransport {
  const value = (raw || 'stdio').toLowerCase();
  if (value === 'stdio' || value === 'http') return value;
  return 'disabled';
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return raw.toLowerCase() !== 'false';
}

export interface AppEnv {
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
  okxProjectId: string;
  agentWalletAddress: string;
  privateKey: string;
  agentChainId: string;
  rpcUrl: string;
  x402PricePerCheck: number;
  x402Enabled: boolean;
  x402PayTo: string;
  x402Network: string;
  x402FacilitatorUrl: string;
  googleApiKey: string;
  googleModel: string;
  statePersistencePath: string;
  adminToken: string;
  port: number;
  enableMcp: boolean;
  mcpTransport: McpTransport;
  okxCredentialsConfigured: boolean;
  liveSwapConfigured: boolean;
}

export const agentConfig: AgentConfig = {
  riskTolerance: parseRiskTolerance(process.env.RISK_TOLERANCE),
  scanIntervalMs: parseNumber('SCAN_INTERVAL_MS', 60_000),
  monitorIntervalMs: parseNumber('MONITOR_INTERVAL_MS', 120_000),
  maxPositionSizeUsdt: parseNumber('MAX_POSITION_SIZE_USDT', 50),
  maxPortfolioSizeUsdt: parseNumber('MAX_PORTFOLIO_SIZE_USDT', 500),
  chainId: process.env.AGENT_CHAIN_ID || '196',
  rpcUrl: readEnv('RPC_URL', 'https://rpc.xlayer.tech'),
  x402Enabled: parseBooleanEnv('X402_ENABLED', true),
  x402Network: readEnv('X402_NETWORK', 'base'),
  x402PricePerCheck: parseNumber('X402_PRICE_PER_CHECK', 0.005),
  aiProvider: process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini' : 'local-fallback',
  aiModel: readEnv('GOOGLE_MODEL', 'gemini-2.5-flash'),
  mcpTransport: parseMcpTransport(process.env.MCP_TRANSPORT),
};

validateOkxEnv();

export const env: AppEnv = {
  okxApiKey: readEnv('OKX_API_KEY'),
  okxSecretKey: readEnv('OKX_SECRET_KEY'),
  okxPassphrase: readEnv('OKX_PASSPHRASE'),
  okxProjectId: readEnv('OKX_PROJECT_ID'),
  agentWalletAddress: readEnv('AGENT_WALLET_ADDRESS', '0x0000000000000000000000000000000000000196'),
  privateKey: readEnv('PRIVATE_KEY'),
  agentChainId: process.env.AGENT_CHAIN_ID || '196',
  rpcUrl: readEnv('RPC_URL', 'https://rpc.xlayer.tech'),
  x402PricePerCheck: parseNumber('X402_PRICE_PER_CHECK', 0.005),
  x402Enabled: parseBooleanEnv('X402_ENABLED', true),
  x402PayTo: readEnv('X402_PAY_TO', readEnv('AGENT_WALLET_ADDRESS', '0x0000000000000000000000000000000000000196')),
  x402Network: readEnv('X402_NETWORK', 'base'),
  x402FacilitatorUrl: readEnv('X402_FACILITATOR_URL', 'https://x402.org/facilitator'),
  googleApiKey: readEnv('GOOGLE_GENERATIVE_AI_API_KEY'),
  googleModel: readEnv('GOOGLE_MODEL', 'gemini-2.5-flash'),
  statePersistencePath: resolveRuntimePath('STATE_PERSISTENCE_PATH', '.rugnot-state.json'),
  adminToken: readEnv('ADMIN_TOKEN'),
  port: parseNumber('PORT', 3001),
  enableMcp: (process.env.ENABLE_MCP || 'false').toLowerCase() === 'true',
  mcpTransport: parseMcpTransport(process.env.MCP_TRANSPORT),
  okxCredentialsConfigured: Boolean(process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY && process.env.OKX_PASSPHRASE),
  liveSwapConfigured: Boolean(process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY && process.env.OKX_PASSPHRASE && process.env.PRIVATE_KEY),
};
