import { createServer } from 'node:http';

import cors from 'cors';
import express from 'express';

import { agentConfig, env } from './config.js';
import { executeOpportunity } from './executor.js';
import { startMcpServer } from './mcp.js';
import { fetchWalletBalances } from './okx-api.js';
import { createApiRouter, createDemoRouter } from './routes.js';
import { runScoutCycle } from './scout.js';
import { runSentinelCycle } from './sentinel.js';
import { StateStore } from './state.js';
import { attachWebSocketServer } from './ws.js';
import { createX402Router } from './x402.js';

const app = express();
const server = createServer(app);
const state = new StateStore(agentConfig, env.agentWalletAddress);

app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});
app.use(createApiRouter(state));
app.use(createDemoRouter(state));
app.use(createX402Router(state));

const wss = attachWebSocketServer(server, state);

async function hydrateWalletState(): Promise<void> {
  if (!env.okxCredentialsConfigured) {
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
}

async function defenseTick(): Promise<void> {
  if (state.get().positions.length === 0) {
    return;
  }

  await runSentinelCycle(state);
}

async function start(): Promise<void> {
  await hydrateWalletState();
  state.setRunning(true);
  await startMcpServer(state);

  server.listen(env.port, () => {
    console.log(`SentinelFi agent listening on http://localhost:${env.port}`);
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
    wss.close(() => {
      server.close(() => process.exit(0));
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start SentinelFi agent:', error);
  process.exit(1);
});
