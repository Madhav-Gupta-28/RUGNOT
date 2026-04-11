import { create } from 'zustand';

import { apiGet } from './lib/api';
import type { AgentState, WsEvent } from './lib/types';

const initialState: AgentState = {
  isRunning: false,
  isPaused: false,
  walletAddress: '',
  walletBalance: 0,
  positions: [],
  recentVerdicts: [],
  recentTrades: [],
  recentThreats: [],
  x402Transactions: [],
  x402TotalEarned: 0,
  x402TotalSpent: 0,
  config: {
    riskTolerance: 'moderate',
    scanIntervalMs: 60_000,
    monitorIntervalMs: 120_000,
    maxPositionSizeUsdt: 50,
    maxPortfolioSizeUsdt: 500,
  },
};

interface RugnotStore {
  state: AgentState;
  events: WsEvent[];
  isLoading: boolean;
  error: string | null;
  addEvent: (event: WsEvent) => void;
  updateState: (partial: Partial<AgentState>) => void;
  fetchState: () => Promise<void>;
}

export const useRugnotStore = create<RugnotStore>((set) => ({
  state: initialState,
  events: [],
  isLoading: false,
  error: null,
  addEvent: (event) => set((current) => ({
    events: [event, ...current.events].slice(0, 50),
  })),
  updateState: (partial) => set((current) => ({
    state: {
      ...current.state,
      ...partial,
      config: {
        ...current.state.config,
        ...(partial.config ?? {}),
      },
    },
  })),
  fetchState: async () => {
    set({ isLoading: true, error: null });
    try {
      const state = await apiGet<AgentState>('/api/state');
      set({ state, isLoading: false, error: null });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not reach the agent API',
      });
    }
  },
}));
