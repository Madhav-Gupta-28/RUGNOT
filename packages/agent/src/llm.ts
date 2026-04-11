import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import { runScoutCycle } from './scout.js';
import type { StateStore } from './state.js';

type ToolInput = Record<string, unknown>;

let anthropic: Anthropic | null = null;

const tools: Tool[] = [
  {
    name: 'check_token_safety',
    description: 'Run RUGNOT 5-layer Guardian security analysis for a token on X Layer.',
    input_schema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'Token contract address on X Layer.',
        },
      },
      required: ['tokenAddress'],
    },
  },
  {
    name: 'get_portfolio_risks',
    description: 'Run Guardian security checks for every open position in the current RUGNOT portfolio.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_safe_opportunities',
    description: 'Discover OKX market signals and return opportunities that passed Guardian vetting.',
    input_schema: {
      type: 'object',
      properties: {
        minScore: {
          type: 'number',
          description: 'Minimum Guardian score to include. Defaults to 70.',
        },
      },
    },
  },
];

function getAnthropicClient(): Anthropic | null {
  if (!env.anthropicApiKey) {
    return null;
  }

  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

function fallbackChatReply(state: StateStore, message: string): string {
  const snapshot = state.get();
  const normalized = message.toLowerCase();

  if (normalized.includes('portfolio')) {
    return `Claude is not configured yet. Local state: ${snapshot.positions.length} open positions, ${snapshot.walletBalance.toFixed(2)} USDT available.`;
  }

  if (normalized.includes('threat')) {
    const latestThreat = snapshot.recentThreats[0];
    return latestThreat
      ? `Claude is not configured yet. Latest local threat: ${latestThreat.tokenSymbol} ${latestThreat.threatType} (${latestThreat.severity}).`
      : 'Claude is not configured yet. Local state has no threats detected.';
  }

  if (normalized.includes('trade')) {
    const latestTrade = snapshot.recentTrades[0];
    return latestTrade
      ? `Claude is not configured yet. Latest local trade: ${latestTrade.type} ${latestTrade.tokenSymbol}, status ${latestTrade.status}.`
      : 'Claude is not configured yet. Local state has no executed trades.';
  }

  return 'Claude is not configured yet. Add ANTHROPIC_API_KEY to enable the live AI security copilot.';
}

async function runTool(state: StateStore, name: string, input: ToolInput): Promise<unknown> {
  if (name === 'check_token_safety') {
    const tokenAddress = typeof input.tokenAddress === 'string' ? input.tokenAddress : '';
    if (!tokenAddress) {
      return { error: 'tokenAddress is required' };
    }
    const verdict = await vetToken(tokenAddress);
    state.addVerdict(verdict);
    return verdict;
  }

  if (name === 'get_portfolio_risks') {
    const verdicts = [];
    for (const position of state.get().positions) {
      const verdict = await vetToken(position.tokenAddress, 'exit');
      state.addVerdict(verdict);
      verdicts.push({
        tokenSymbol: position.tokenSymbol,
        tokenAddress: position.tokenAddress,
        pnlPercent: position.pnlPercent,
        verdict,
      });
    }
    return {
      walletBalance: state.get().walletBalance,
      positionsChecked: verdicts.length,
      verdicts,
    };
  }

  if (name === 'find_safe_opportunities') {
    const minScore = typeof input.minScore === 'number' && Number.isFinite(input.minScore)
      ? input.minScore
      : 70;
    const opportunities = await runScoutCycle(state);
    return opportunities.filter((opportunity) => opportunity.verdict.score >= minScore);
  }

  return { error: `Unknown tool ${name}` };
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function buildSystemPrompt(state: StateStore): string {
  const snapshot = state.get();
  return [
    'You are RUGNOT, a concise AI security copilot for an autonomous DeFi agent on OKX X Layer.',
    'Your job is to help the user understand token safety, open-position risk, scout opportunities, x402 economics, and live agent status.',
    'Use tools whenever the user asks about a token address, portfolio risk, or opportunities.',
    'Never invent onchain facts. If a tool returns unavailable or empty data, say so plainly and recommend caution.',
    'Keep replies short, practical, and dashboard-friendly.',
    `Current mode: ${snapshot.isPaused ? 'paused' : snapshot.isRunning ? 'running' : 'stopped'}.`,
    `Wallet: ${snapshot.walletAddress}. Balance: ${snapshot.walletBalance.toFixed(2)} USDT.`,
    `Open positions: ${snapshot.positions.length}. Recent threats: ${snapshot.recentThreats.length}. Recent verdicts: ${snapshot.recentVerdicts.length}.`,
  ].join('\n');
}

export async function buildChatReply(state: StateStore, message: string): Promise<string> {
  const client = getAnthropicClient();
  if (!client) {
    return fallbackChatReply(state, message);
  }

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: message,
    },
  ];

  try {
    for (let turn = 0; turn < 3; turn += 1) {
      const response = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 900,
        system: buildSystemPrompt(state),
        tools,
        messages,
      });

      const toolUses = response.content.filter((block) => block.type === 'tool_use');
      if (toolUses.length === 0) {
        const text = extractText(response.content);
        return text || 'RUGNOT is online, but Claude returned an empty response.';
      }

      messages.push({
        role: 'assistant',
        content: response.content as MessageParam['content'],
      });

      messages.push({
        role: 'user',
        content: await Promise.all(toolUses.map(async (toolUse) => ({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: JSON.stringify(await runTool(state, toolUse.name, toolUse.input as ToolInput), null, 2),
        }))),
      });
    }

    return 'I ran the requested tools, but the model did not produce a final answer. Try a narrower question.';
  } catch (error) {
    console.error('[Chat] Claude request failed:', error);
    return `${fallbackChatReply(state, message)} Claude request failed, so this reply used local state only.`;
  }
}
