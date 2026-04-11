import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import { fetchWalletBalances } from './okx-api.js';
import { runScoutCycle } from './scout.js';
import type { StateStore } from './state.js';
import type { Verdict, VettedOpportunity } from './types.js';

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

export async function startMcpServer(state: StateStore): Promise<McpServer | null> {
  if (!env.enableMcp || env.mcpTransport !== 'stdio') {
    return null;
  }

  const server = new McpServer({
    name: 'sentinelfi-mcp',
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
