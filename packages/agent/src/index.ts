import { createServer } from 'node:http';

import cors from 'cors';
import express from 'express';

import { agentConfig, env } from './config.js';
import { executeOpportunity } from './executor.js';
import { createMcpHttpRouter, startMcpServer } from './mcp.js';
import { fetchWalletBalances, getWalletOnchainBalances, verifyOkxCredentials } from './okx-api.js';
import { createApiRouter, createDemoRouter } from './routes.js';
import { runScoutCycle } from './scout.js';
import { runSentinelCycle } from './sentinel.js';
import { StateStore } from './state.js';
import { attachWebSocketServer } from './ws.js';
import { createX402Router } from './x402.js';

const app = express();
const server = createServer(app);
const state = new StateStore(agentConfig, env.agentWalletAddress, env.statePersistencePath);
let liveApiAvailable = false;
let discoveryEnabled = false;
let discoveryInFlight = false;
let defenseInFlight = false;

const allowedOrigins = process.env.DASHBOARD_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-PAYMENT', 'X-ADMIN-TOKEN'],
  exposedHeaders: ['X-PAYMENT-RESPONSE'],
}));
app.use(express.json());
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});
app.use(createApiRouter(state));
if (process.env.ENABLE_DEMO === 'true') {
  app.use(createDemoRouter(state));
}
app.use(createX402Router(state));
app.use(createMcpHttpRouter(state));

const wss = attachWebSocketServer(server, state);

async function hydrateWalletState(): Promise<void> {
  if (!liveApiAvailable) {
    state.setWalletBalance(state.get().walletBalance);
    return;
  }

  const wallet = await fetchWalletBalances(env.agentWalletAddress);
  state.setWalletBalance(wallet.walletBalance);

  if (state.get().positions.length === 0 && wallet.positions.length > 0) {
    state.replacePositions(wallet.positions);
  }
}

async function discoveryTick(): Promise<void> {
  if (!discoveryEnabled || state.get().isPaused || discoveryInFlight) {
    return;
  }

  discoveryInFlight = true;
  try {
    await hydrateWalletState();

    if (state.get().walletBalance <= 0) {
      console.warn('[SCOUT] Wallet balance is zero. Skipping discovery cycle.');
      return;
    }

    const vetted = await runScoutCycle(state);
    const existingTokenAddresses = new Set(state.get().positions.map((position) => position.tokenAddress));

    for (const opportunity of vetted) {
      if (existingTokenAddresses.has(opportunity.tokenAddress)) {
        continue;
      }

      const trade = await executeOpportunity(opportunity, state);
      if (trade?.status === 'confirmed' || trade?.status === 'pending') {
        break;
      }
    }
  } finally {
    discoveryInFlight = false;
  }
}

async function runStartupValidation(): Promise<void> {
  console.log(`[RUGNOT] Wallet ${env.agentWalletAddress}`);
  console.log(`[RUGNOT] X Layer RPC ${env.rpcUrl}`);

  if (!env.okxCredentialsConfigured) {
    console.warn('[RUGNOT] Demo mode: OKX credentials are not configured. Real API calls and live swaps are disabled.');
    liveApiAvailable = false;
    discoveryEnabled = false;
    return;
  }

  liveApiAvailable = await verifyOkxCredentials();
  if (!liveApiAvailable) {
    console.error('[RUGNOT] OKX API credential validation failed. Starting in demo-safe mode.');
    discoveryEnabled = false;
    return;
  }

  console.log('[RUGNOT] OKX API credentials validated.');

  const balances = await getWalletOnchainBalances(env.agentWalletAddress);
  state.setWalletBalance(balances.usdt);
  console.log(`[RUGNOT] OKB Balance: ${balances.okb.toFixed(6)} OKB`);
  console.log(`[RUGNOT] USDT Balance: ${balances.usdt.toFixed(6)} USDT`);

  if (!env.privateKey) {
    console.warn('[RUGNOT] PRIVATE_KEY is missing. Live portfolio reads are enabled, but Loop A swap execution is disabled.');
    discoveryEnabled = false;
    return;
  }

  if (balances.okb <= 0 || balances.usdt <= 0) {
    console.warn('[RUGNOT] Wallet needs both OKB gas and USDT trading balance. Loop A disabled, Loop B remains active.');
    discoveryEnabled = false;
    return;
  }

  console.log('[RUGNOT] Live mode enabled. Discovery and defense loops can use real X Layer data.');
  discoveryEnabled = true;
}

async function defenseTick(): Promise<void> {
  if (state.get().isPaused || defenseInFlight || state.get().positions.length === 0) {
    return;
  }

  defenseInFlight = true;
  try {
    await runSentinelCycle(state);
  } finally {
    defenseInFlight = false;
  }
}

async function start(): Promise<void> {
  await runStartupValidation();
  await hydrateWalletState();
  state.setRunning(true);
  await startMcpServer(state);

  server.listen(env.port, () => {
    console.log(`RUGNOT agent listening on http://localhost:${env.port}`);
  });

  void discoveryTick().catch((error) => {
    console.error('[SCOUT] Initial discovery cycle failed:', error);
  });
  void defenseTick().catch((error) => {
    console.error('[SENTINEL] Initial defense cycle failed:', error);
  });

  const scoutTimer = setInterval(() => {
    void discoveryTick().catch((error) => {
      console.error('[SCOUT] Discovery cycle failed:', error);
    });
  }, state.get().config.scanIntervalMs);

  const sentinelTimer = setInterval(() => {
    void defenseTick().catch((error) => {
      console.error('[SENTINEL] Defense cycle failed:', error);
    });
  }, state.get().config.monitorIntervalMs);

  const shutdown = () => {
    clearInterval(scoutTimer);
    clearInterval(sentinelTimer);
    state.setRunning(false);
    for (const client of wss.clients) {
      client.close();
    }
    void state.flush().finally(() => {
      wss.close(() => {
        server.close(() => process.exit(0));
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start RUGNOT agent:', error);
  process.exit(1);
});
