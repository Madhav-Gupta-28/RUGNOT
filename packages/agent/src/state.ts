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

  constructor(config: AgentConfig, walletAddress: string) {
    this.state = {
      isRunning: false, walletAddress, walletBalance: 0,
      positions: [], recentVerdicts: [], recentTrades: [],
      recentThreats: [], x402Transactions: [],
      x402TotalEarned: 0, x402TotalSpent: 0, config,
    };
  }

  get(): AgentState { return this.state; }
  update(partial: Partial<AgentState>) { Object.assign(this.state, partial); }

  addVerdict(v: Verdict) {
    this.state.recentVerdicts.unshift(v);
    if (this.state.recentVerdicts.length > 100) this.state.recentVerdicts.pop();
    this.emit({ type: 'verdict', data: v, timestamp: Date.now() });
  }

  addTrade(t: TradeExecution) {
    this.state.recentTrades.unshift(t);
    if (this.state.recentTrades.length > 100) this.state.recentTrades.pop();
    this.emit({ type: 'trade', data: t, timestamp: Date.now() });
  }

  addThreat(t: ThreatAlert) {
    this.state.recentThreats.unshift(t);
    if (this.state.recentThreats.length > 50) this.state.recentThreats.pop();
    this.emit({ type: 'threat', data: t, timestamp: Date.now() });
  }

  addPosition(p: Position) { this.state.positions.push(p); }
  removePosition(tokenAddress: string) {
    this.state.positions = this.state.positions.filter(p => p.tokenAddress !== tokenAddress);
  }

  subscribe(fn: (event: WsEvent) => void) { this.listeners.add(fn); }
  unsubscribe(fn: (event: WsEvent) => void) { this.listeners.delete(fn); }
  private emit(event: WsEvent) { this.listeners.forEach(fn => fn(event)); }

  setRunning(isRunning: boolean) {
    this.state.isRunning = isRunning;
    this.broadcastState();
  }

  setWalletBalance(walletBalance: number) {
    this.state.walletBalance = walletBalance;
    this.broadcastState();
  }

  upsertPosition(position: Position) {
    const index = this.state.positions.findIndex((item) => item.tokenAddress === position.tokenAddress);
    if (index === -1) {
      this.state.positions.push(position);
    } else {
      this.state.positions[index] = position;
    }
    this.broadcastState();
  }

  replacePositions(positions: Position[]) {
    this.state.positions = positions;
    this.broadcastState();
  }

  addX402Transaction(tx: X402Transaction) {
    this.state.x402Transactions.unshift(tx);
    if (tx.direction === 'earned') {
      this.state.x402TotalEarned += tx.amount;
    } else {
      this.state.x402TotalSpent += tx.amount;
    }
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
