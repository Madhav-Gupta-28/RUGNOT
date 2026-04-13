import { create } from 'zustand';

import { apiGet } from './lib/api';
import type { AgentState, WsEvent } from './lib/types';

type DemoStatus = 'idle' | 'running' | 'done' | 'error';

interface DemoRunState {
  status: DemoStatus;
  activeRunId: string;
  endsAt: number;
  error: string;
}

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
    chainId: '196',
    rpcUrl: 'https://rpc.xlayer.tech',
    x402Enabled: false,
    x402Network: 'base',
    x402PricePerCheck: 0.005,
    aiProvider: 'local-fallback',
    aiModel: 'gemini-2.5-flash',
    mcpTransport: 'http',
    mainnetDemoEnabled: false,
    publicMainnetDemo: false,
    mainnetDemoAmountUsdt: 1,
    mainnetDemoTokenSymbol: 'XDOG/FDOG',
    mainnetDemoBuyCount: 3,
    mainnetDemoMonitorMs: 55_000,
  },
};

interface RugnotStore {
  state: AgentState;
  events: WsEvent[];
  demoRun: DemoRunState;
  isLoading: boolean;
  error: string | null;
  addEvent: (event: WsEvent) => void;
  updateState: (partial: Partial<AgentState>) => void;
  setDemoRun: (partial: Partial<DemoRunState>) => void;
  fetchState: () => Promise<void>;
}

export const useRugnotStore = create<RugnotStore>((set) => ({
  state: initialState,
  events: [],
  demoRun: {
    status: 'idle',
    activeRunId: '',
    endsAt: 0,
    error: '',
  },
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
  setDemoRun: (partial) => set((current) => ({
    demoRun: {
      ...current.demoRun,
      ...partial,
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
