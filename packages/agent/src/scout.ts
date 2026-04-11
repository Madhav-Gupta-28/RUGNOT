import { fetchSignalFeed } from './okx-api.js';
import { vetToken } from './guardian.js';
import type { StateStore } from './state.js';
import type { AgentConfig, TradeOpportunity, VettedOpportunity } from './types.js';

const RISK_SCORE_FLOORS: Record<AgentConfig['riskTolerance'], number> = {
  conservative: 80,
  moderate: 70,
  aggressive: 60,
};

function getMaxCandidates(config: AgentConfig): number {
  switch (config.riskTolerance) {
    case 'conservative':
      return 3;
    case 'aggressive':
      return 8;
    default:
      return 5;
  }
}

function isOpportunityAllowed(opportunity: TradeOpportunity, config: AgentConfig): boolean {
  return opportunity.signalStrength >= RISK_SCORE_FLOORS[config.riskTolerance] - 10;
}

export async function discoverOpportunities(state: StateStore): Promise<TradeOpportunity[]> {
  const { config } = state.get();
  const opportunities = await fetchSignalFeed();

  return opportunities
    .filter((opportunity) => isOpportunityAllowed(opportunity, config))
    .slice(0, getMaxCandidates(config));
}

export async function runScoutCycle(state: StateStore): Promise<VettedOpportunity[]> {
  const opportunities = await discoverOpportunities(state);
  const vetted: VettedOpportunity[] = [];
  const minScore = RISK_SCORE_FLOORS[state.get().config.riskTolerance];

  for (const opportunity of opportunities) {
    const verdict = await vetToken(opportunity.tokenAddress);
    state.addVerdict(verdict);

    if (verdict.level === 'GO' && verdict.score >= minScore) {
      vetted.push({ ...opportunity, verdict });
    }
  }

  state.broadcastState();
  return vetted.sort((left, right) => right.verdict.score - left.verdict.score);
}
