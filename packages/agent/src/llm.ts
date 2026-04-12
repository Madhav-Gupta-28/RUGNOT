// @ts-nocheck
import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import { runScoutCycle } from './scout.js';
import type { StateStore } from './state.js';

function fallbackChatReply(state: StateStore, message: string): string {
  const snapshot = state.get();
  const normalized = message.toLowerCase();

  if (normalized.includes('portfolio')) {
    return `AI is not configured yet. Local state: ${snapshot.positions.length} open positions, ${snapshot.walletBalance.toFixed(2)} USDT available.`;
  }

  if (normalized.includes('threat')) {
    const latestThreat = snapshot.recentThreats[0];
    return latestThreat
      ? `AI is not configured yet. Latest local threat: ${latestThreat.tokenSymbol} ${latestThreat.threatType} (${latestThreat.severity}).`
      : 'AI is not configured yet. Local state has no threats detected.';
  }

  if (normalized.includes('trade')) {
    const latestTrade = snapshot.recentTrades[0];
    return latestTrade
      ? `AI is not configured yet. Latest local trade: ${latestTrade.type} ${latestTrade.tokenSymbol}, status ${latestTrade.status}.`
      : 'AI is not configured yet. Local state has no executed trades.';
  }

  return 'AI is not configured yet. Add GOOGLE_GENERATIVE_AI_API_KEY to enable the live AI security copilot.';
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
  if (!env.googleApiKey) {
    return fallbackChatReply(state, message);
  }

  try {
    const response = await generateText({
      model: google(env.googleModel),
      system: buildSystemPrompt(state),
      prompt: message,
      tools: {
        check_token_safety: tool({
          description: 'Run RUGNOT 5-layer Guardian security analysis for a token on X Layer.',
          parameters: z.object({
            tokenAddress: z.string().describe('Token contract address on X Layer.'),
          }),
          execute: async ({ tokenAddress }: { tokenAddress: string }) => {
            const verdict = await vetToken(tokenAddress);
            state.addVerdict(verdict);
            return verdict;
          },
        }),
        get_portfolio_risks: tool({
          description: 'Run Guardian security checks for every open position in the current RUGNOT portfolio.',
          parameters: z.object({}),
          execute: async (_args: {}) => {
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
          },
        }),
        find_safe_opportunities: tool({
          description: 'Discover OKX market signals and return opportunities that passed Guardian vetting.',
          parameters: z.object({
            minScore: z.number().default(70).describe('Minimum Guardian score to include. Defaults to 70.'),
          }),
          execute: async ({ minScore }: { minScore: number }) => {
            const opportunities = await runScoutCycle(state);
            return opportunities.filter((opportunity) => opportunity.verdict.score >= minScore);
          },
        }),
      },
    });

    if (response.text) {
      return response.text;
    }
    
    if (response.toolResults && response.toolResults.length > 0) {
      return `RUGNOT executed tools successfully:\n${JSON.stringify(response.toolResults, null, 2)}`;
    }

    return 'RUGNOT is online, but Gemini returned an empty response.';
  } catch (error) {
    console.error('[Chat] Gemini AI request failed:', error);
    return `${fallbackChatReply(state, message)} AI request failed, so this reply used local state only.`;
  }
}
