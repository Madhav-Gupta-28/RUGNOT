import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router } from 'express';
import { z } from 'zod';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import { fetchWalletBalances } from './okx-api.js';
import { runScoutCycle } from './scout.js';
import type { StateStore } from './state.js';
import type { Verdict, VettedOpportunity } from './types.js';

if (env.enableMcp && env.mcpTransport === 'stdio') {
  console.log = console.error.bind(console);
}

function asToolResult(payload: Verdict | Verdict[] | VettedOpportunity[]) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: { result: payload },
  };
}

export function createRugnotMcpServer(state: StateStore): McpServer {
  const server = new McpServer({
    name: 'rugnot-mcp',
    version: '0.1.0',
  });

  server.tool(
    'check_token_safety',
    'Run 5-layer security analysis on a token on X Layer',
    {
      tokenAddress: z.string().describe('Token contract address on X Layer'),
    },
    async ({ tokenAddress }) => {
      const verdict = await vetToken(tokenAddress);
      state.addVerdict(verdict);
      return asToolResult(verdict);
    },
  );

  server.tool(
    'get_portfolio_risks',
    'Get security risk analysis for all tokens in a wallet',
    {
      walletAddress: z.string(),
    },
    async ({ walletAddress }) => {
      const wallet = walletAddress || state.get().walletAddress;
      const positions = wallet === state.get().walletAddress
        ? state.get().positions
        : (await fetchWalletBalances(wallet)).positions;

      const verdicts: Verdict[] = [];
      for (const position of positions) {
        const verdict = await vetToken(position.tokenAddress);
        state.addVerdict(verdict);
        verdicts.push(verdict);
      }

      return asToolResult(verdicts);
    },
  );

  server.tool(
    'find_safe_opportunities',
    'Get smart money trading signals that passed security vetting',
    {
      minScore: z.number().default(70),
    },
    async ({ minScore }) => {
      const opportunities = await runScoutCycle(state);
      const filtered = opportunities.filter((opportunity) => opportunity.verdict.score >= minScore);
      return asToolResult(filtered);
    },
  );

  return server;
}

export async function startMcpStdioServer(state: StateStore): Promise<McpServer> {
  const server = createRugnotMcpServer(state);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

export async function startMcpServer(state: StateStore): Promise<McpServer | null> {
  if (!env.enableMcp || env.mcpTransport !== 'stdio') {
    return null;
  }

  return startMcpStdioServer(state);
}

export function createMcpHttpRouter(state: StateStore): Router {
  const router = Router();

  router.all('/mcp', async (req, res) => {
    if (!env.enableMcp || env.mcpTransport !== 'http') {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'MCP HTTP transport is disabled' },
        id: null,
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST /mcp.' },
        id: null,
      });
    }

    const server = createRugnotMcpServer(state);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error('[MCP] HTTP request failed:', error);
      if (!res.headersSent) {
        return res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }

    return undefined;
  });

  return router;
}
