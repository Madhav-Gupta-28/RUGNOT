import fs from 'node:fs';
import path from 'node:path';

import type {
  AgentConfig,
  AgentState,
  Position,
  ThreatAlert,
  TradeExecution,
  Verdict,
  WsEvent,
  X402Transaction,
} from './types.js';

export class StateStore {
  private state: AgentState;
  private listeners: Set<(event: WsEvent) => void> = new Set();
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly persistPath: string;

  constructor(config: AgentConfig, walletAddress: string, persistPath = '') {
    this.persistPath = persistPath;
    const persisted = this.loadPersistedState();
    const base: AgentState = {
      isRunning: false,
      isPaused: persisted?.isPaused ?? false,
      walletAddress,
      walletBalance: persisted?.walletBalance ?? 0,
      positions: [], recentVerdicts: [], recentTrades: [],
      recentThreats: [], x402Transactions: [],
      x402TotalEarned: 0, x402TotalSpent: 0, config,
    };
    this.state = {
      ...base,
      ...persisted,
      isRunning: false,
      walletAddress,
      config: {
        ...config,
        ...(persisted?.config ?? {}),
      },
    };
  }

  get(): AgentState { return this.state; }
  update(partial: Partial<AgentState>) {
    Object.assign(this.state, partial);
    this.persistSoon();
  }

  private loadPersistedState(): Partial<AgentState> | null {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.persistPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AgentState>;
      return {
        ...parsed,
        isRunning: false,
      };
    } catch (error) {
      console.warn(`[StateStore] Could not load persisted state from ${this.persistPath}:`, error);
      return null;
    }
  }

  private persistSoon() {
    if (!this.persistPath || this.persistTimer) {
      return;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush().catch((error) => {
        console.warn(`[StateStore] Could not persist state to ${this.persistPath}:`, error);
      });
    }, 250);
  }

  async flush(): Promise<void> {
    if (!this.persistPath) {
      return;
    }

    await fs.promises.mkdir(path.dirname(path.resolve(this.persistPath)), { recursive: true });
    const persisted: AgentState = {
      ...this.state,
      isRunning: false,
    };
    await fs.promises.writeFile(this.persistPath, JSON.stringify(persisted, null, 2), 'utf-8');
  }

  addVerdict(v: Verdict) {
    this.state.recentVerdicts.unshift(v);
    if (this.state.recentVerdicts.length > 100) this.state.recentVerdicts.pop();
    this.persistSoon();
    this.emit({ type: 'verdict', data: v, timestamp: Date.now() });
  }

  addTrade(t: TradeExecution) {
    this.state.recentTrades.unshift(t);
    if (this.state.recentTrades.length > 100) this.state.recentTrades.pop();
    this.persistSoon();
    this.emit({ type: 'trade', data: t, timestamp: Date.now() });
  }

  addThreat(t: ThreatAlert) {
    this.state.recentThreats.unshift(t);
    if (this.state.recentThreats.length > 50) this.state.recentThreats.pop();
    this.persistSoon();
    this.emit({ type: 'threat', data: t, timestamp: Date.now() });
  }

  addPosition(p: Position) {
    this.state.positions.push(p);
    this.persistSoon();
  }

  removePosition(tokenAddress: string) {
    this.state.positions = this.state.positions.filter(p => p.tokenAddress !== tokenAddress);
    this.persistSoon();
  }

  subscribe(fn: (event: WsEvent) => void) { this.listeners.add(fn); }
  unsubscribe(fn: (event: WsEvent) => void) { this.listeners.delete(fn); }
  private emit(event: WsEvent) { this.listeners.forEach(fn => fn(event)); }

  setRunning(isRunning: boolean) {
    this.state.isRunning = isRunning;
    this.persistSoon();
    this.broadcastState();
  }

  setPaused(isPaused: boolean) {
    this.state.isPaused = isPaused;
    this.persistSoon();
    this.broadcastState();
  }

  setWalletBalance(walletBalance: number) {
    this.state.walletBalance = walletBalance;
    this.persistSoon();
    this.broadcastState();
  }

  upsertPosition(position: Position) {
    const index = this.state.positions.findIndex((item) => item.tokenAddress === position.tokenAddress);
    if (index === -1) {
      this.state.positions.push(position);
    } else {
      this.state.positions[index] = position;
    }
    this.persistSoon();
    this.broadcastState();
  }

  replacePositions(positions: Position[]) {
    this.state.positions = positions;
    this.persistSoon();
    this.broadcastState();
  }

  addX402Transaction(tx: X402Transaction) {
    this.state.x402Transactions.unshift(tx);
    if (tx.direction === 'earned') {
      this.state.x402TotalEarned += tx.amount;
    } else {
      this.state.x402TotalSpent += tx.amount;
    }
    this.persistSoon();
    this.emit({ type: 'x402', data: tx, timestamp: Date.now() });
    this.broadcastState();
  }

  emitEvent(event: WsEvent) {
    this.emit(event);
  }

  broadcastState() {
    this.emit({ type: 'state-update', data: this.state, timestamp: Date.now() });
  }
}
