import { agentConfig, env } from './config.js';
import { startMcpStdioServer } from './mcp.js';
import { StateStore } from './state.js';

console.log = console.error.bind(console);

const state = new StateStore(agentConfig, env.agentWalletAddress, env.statePersistencePath);

startMcpStdioServer(state).catch((error) => {
  console.error('[MCP] Failed to start stdio server:', error);
  process.exit(1);
});
