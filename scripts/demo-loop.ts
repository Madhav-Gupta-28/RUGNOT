import WebSocket from 'ws';

const AGENT_HTTP_URL = process.env.AGENT_HTTP_URL || 'http://localhost:3001';
const AGENT_WS_URL = process.env.AGENT_WS_URL || 'ws://localhost:3001/ws';
const INTERVAL_MS = Number(process.env.DEMO_INTERVAL_MS || 30_000);

function waitForAgentWebSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(AGENT_WS_URL);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out connecting to ${AGENT_WS_URL}`));
    }, 5000);

    socket.on('open', () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function triggerDemoCycle(): Promise<void> {
  const response = await fetch(`${AGENT_HTTP_URL}/api/demo/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Demo trigger failed with ${response.status}`);
  }

  const json = await response.json() as { message?: string };
  console.log(`[demo-loop] ${json.message || 'Demo cycle triggered'} at ${new Date().toLocaleTimeString()}`);
}

async function main(): Promise<void> {
  console.log(`[demo-loop] Checking agent WebSocket at ${AGENT_WS_URL}`);
  await waitForAgentWebSocket();
  console.log('[demo-loop] Agent is running. Starting demo activity.');

  await triggerDemoCycle();
  const timer = setInterval(() => {
    void triggerDemoCycle().catch((error) => {
      console.error('[demo-loop] Trigger failed:', error);
    });
  }, INTERVAL_MS);

  const shutdown = () => {
    clearInterval(timer);
    console.log('\n[demo-loop] Stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[demo-loop] Agent is not ready:', error);
  process.exit(1);
});
