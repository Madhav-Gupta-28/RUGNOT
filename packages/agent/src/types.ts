export type VerdictLevel = 'GO' | 'CAUTION' | 'DANGER';

export interface SecurityCheck {
  name: string;
  passed: boolean;
  score: number;
  reason: string;
  rawData?: unknown;
}

export interface Verdict {
  tokenAddress: string;
  chain: 'xlayer';
  level: VerdictLevel;
  score: number;
  checks: SecurityCheck[];
  timestamp: number;
  executionTimeMs: number;
}

export interface TradeOpportunity {
  tokenAddress: string;
  tokenSymbol: string;
  signalType: 'smart-money' | 'kol' | 'volume-spike' | 'new-launch';
  signalStrength: number;
  currentPrice: number;
}

export interface Position {
  tokenAddress: string;
  tokenSymbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  pnlPercent: number;
  pnlUsd: number;
  lastSecurityCheck: number;
  lastVerdictLevel: VerdictLevel;
}

export interface TradeExecution {
  id: string;
  type: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol: string;
  amountIn: number;
  amountOut: number;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  verdict?: Verdict;
  timestamp: number;
}

export interface ThreatAlert {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  threatType: 'whale-dump' | 'price-crash' | 'liquidity-pull' | 'contract-change';
  severity: 'medium' | 'high' | 'critical';
  description: string;
  action: 'alert-only' | 'auto-exit';
  exitTxHash?: string;
  timestamp: number;
}

export interface X402Transaction {
  id: string;
  direction: 'earned' | 'spent';
  amount: number;
  service: string;
  timestamp: number;
}

export interface AgentState {
  isRunning: boolean;
  walletAddress: string;
  walletBalance: number;
  positions: Position[];
  recentVerdicts: Verdict[];
  recentTrades: TradeExecution[];
  recentThreats: ThreatAlert[];
  x402Transactions: X402Transaction[];
  x402TotalEarned: number;
  x402TotalSpent: number;
  config: AgentConfig;
}

export interface AgentConfig {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  scanIntervalMs: number;
  monitorIntervalMs: number;
  maxPositionSizeUsdt: number;
  maxPortfolioSizeUsdt: number;
}

export interface WsEvent {
  type: 'verdict' | 'trade' | 'threat' | 'exit' | 'x402' | 'state-update';
  data: unknown;
  timestamp: number;
}

export interface EconomicsSnapshot {
  transactions: X402Transaction[];
  totalEarned: number;
  totalSpent: number;
  netRevenue: number;
}

export interface VettedOpportunity extends TradeOpportunity {
  verdict: Verdict;
}
