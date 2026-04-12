import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { formatMoney, formatTokenAmount, timeAgo, truncateAddress } from '../lib/format';
import type { AgentState, SecurityCheck, ThreatAlert, TradeExecution, Verdict, X402Transaction } from '../lib/types';

type Tone = 'safe' | 'caution' | 'danger' | 'info' | 'muted';

interface DetailRow {
  label: string;
  value: string;
  tone?: Tone;
}

const toneText: Record<Tone, string> = {
  safe: 'text-accent-safe',
  caution: 'text-accent-caution',
  danger: 'text-accent-danger',
  info: 'text-accent-info',
  muted: 'text-secondary',
};

const toneBorder: Record<Tone, string> = {
  safe: 'border-accent-safe/35 bg-accent-safe/10 text-accent-safe',
  caution: 'border-accent-caution/35 bg-accent-caution/10 text-accent-caution',
  danger: 'border-accent-danger/35 bg-accent-danger/10 text-accent-danger',
  info: 'border-accent-info/35 bg-accent-info/10 text-accent-info',
  muted: 'border-border bg-bg/50 text-secondary',
};

function formatInterval(ms: number): string {
  if (ms >= 60_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  return `${Math.round(ms / 1_000)}s`;
}

function verdictTone(verdict?: Verdict): Tone {
  if (!verdict) return 'muted';
  if (verdict.level === 'GO') return 'safe';
  if (verdict.level === 'CAUTION') return 'caution';
  return 'danger';
}

function tradeTone(trade?: TradeExecution): Tone {
  if (!trade) return 'muted';
  if (trade.status === 'failed') return 'danger';
  if (trade.status === 'pending') return 'caution';
  return trade.type === 'sell' ? 'info' : 'safe';
}

function threatTone(threat?: ThreatAlert): Tone {
  if (!threat) return 'safe';
  if (threat.severity === 'critical') return 'danger';
  if (threat.severity === 'high') return 'danger';
  return 'caution';
}

function weakestCheck(verdict?: Verdict): SecurityCheck | undefined {
  return verdict?.checks.reduce<SecurityCheck | undefined>((weakest, check) => {
    if (!weakest || check.score < weakest.score) return check;
    return weakest;
  }, undefined);
}

function oklinkTxUrl(txHash: string): string {
  return `https://www.oklink.com/x-layer/tx/${txHash}`;
}

function latestX402Label(tx?: X402Transaction): string {
  if (!tx) return 'No settled checks yet';
  const verb = tx.direction === 'earned' ? 'Earned' : 'Spent';
  return `${verb} ${formatMoney(tx.amount, 3)} ${timeAgo(tx.timestamp)}`;
}

function OpsPanel({
  eyebrow,
  title,
  status,
  statusTone,
  primary,
  caption,
  rows,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  status: string;
  statusTone: Tone;
  primary: string;
  caption: string;
  rows: DetailRow[];
  children?: ReactNode;
}>) {
  return (
    <article className="terminal-panel rounded-md p-4 transition hover:border-[#333333] hover:bg-[#080808]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-secondary">{eyebrow}</div>
          <h3 className="mt-1 font-sans text-lg font-bold text-primary">{title}</h3>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${toneBorder[statusTone]}`}>
          {status}
        </span>
      </div>

      <div className={`font-mono text-2xl font-normal tracking-tight ${toneText[statusTone]}`}>{primary}</div>
      <p className="mt-1.5 min-h-8 font-sans text-xs leading-relaxed text-secondary">{caption}</p>

      <div className="mt-4 space-y-1.5 border-t border-border pt-3">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="flex items-center justify-between gap-3 font-mono text-[10px]">
            <span className="uppercase tracking-widest text-secondary">{row.label}</span>
            <span className={`truncate text-right ${toneText[row.tone ?? 'muted']}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {children ? <div className="mt-4 border-t border-border pt-3">{children}</div> : null}
    </article>
  );
}

function ReasoningRail({ state, latestVerdict, latestTrade, latestThreat }: Readonly<{
  state: AgentState;
  latestVerdict?: Verdict;
  latestTrade?: TradeExecution;
  latestThreat?: ThreatAlert;
}>) {
  const exposure = state.positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
  const capacity = Math.max(0, state.config.maxPortfolioSizeUsdt - exposure);
  const weakest = weakestCheck(latestVerdict);
  const lines = [
    `Scout uses ${state.config.riskTolerance} mode with ${formatInterval(state.config.scanIntervalMs)} scans and ${formatMoney(state.config.maxPositionSizeUsdt)} max entry size.`,
    latestVerdict
      ? `Guardian last scored ${truncateAddress(latestVerdict.tokenAddress, 10, 6)} at ${latestVerdict.score}; weakest layer: ${weakest?.name ?? 'none'} (${weakest?.score ?? latestVerdict.score}).`
      : 'Guardian is waiting for the next token scan before producing a fresh five-layer verdict.',
    latestTrade
      ? `Executor last ${latestTrade.type === 'buy' ? 'bought' : 'sold'} ${latestTrade.tokenSymbol} with status ${latestTrade.status}.`
      : `Executor is idle with ${formatMoney(capacity)} remaining portfolio capacity.`,
    latestThreat
      ? `Sentinel latest alert: ${latestThreat.severity} ${latestThreat.threatType} on ${latestThreat.tokenSymbol}; action ${latestThreat.action}.`
      : `Sentinel is monitoring ${state.positions.length} open positions every ${formatInterval(state.config.monitorIntervalMs)}.`,
  ];

  return (
    <section className="terminal-panel rounded-md p-4 mb-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-secondary">AGENT REASONING</div>
          <h2 className="mt-1 font-sans text-xl font-bold text-primary">Current Decision Context</h2>
        </div>
        <span className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${state.isPaused ? toneBorder.caution : state.isRunning ? toneBorder.safe : toneBorder.muted}`}>
          {state.isPaused ? 'PAUSED' : state.isRunning ? 'RUNNING' : 'OFFLINE'}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {lines.map((line, index) => (
          <div key={line} className="rounded border border-[#1a1a1a] bg-[#0a0a0a] p-3">
            <div className="mb-2 font-mono text-[10px] text-accent-safe">0{index + 1}</div>
            <p className="font-sans text-xs leading-relaxed text-secondary">{line}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AgentOpsPanels({ state }: Readonly<{ state: AgentState }>) {
  const latestVerdict = state.recentVerdicts[0];
  const latestTrade = state.recentTrades[0];
  const latestThreat = state.recentThreats[0];
  const latestX402 = state.x402Transactions[0];
  const weakest = weakestCheck(latestVerdict);
  const exposure = state.positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
  const capacity = Math.max(0, state.config.maxPortfolioSizeUsdt - exposure);
  const confirmedTrades = state.recentTrades.filter((trade) => trade.status === 'confirmed').length;
  const x402Net = state.x402TotalEarned - state.x402TotalSpent;

  return (
    <section className="space-y-6">
      <ReasoningRail state={state} latestVerdict={latestVerdict} latestTrade={latestTrade} latestThreat={latestThreat} />

      <div className="grid gap-4 lg:grid-cols-3">
        <OpsPanel
          eyebrow="LOOP A"
          title="Scout"
          status={state.isPaused ? 'PAUSED' : state.isRunning ? 'SCANNING' : 'IDLE'}
          statusTone={state.isPaused ? 'caution' : state.isRunning ? 'safe' : 'muted'}
          primary={`${state.recentVerdicts.length}`}
          caption="Verdicts recorded from market candidates and manual checks."
          rows={[
            { label: 'scan interval', value: formatInterval(state.config.scanIntervalMs), tone: 'info' },
            { label: 'risk mode', value: state.config.riskTolerance.toUpperCase(), tone: state.config.riskTolerance === 'conservative' ? 'safe' : 'caution' },
            { label: 'last scan', value: latestVerdict ? timeAgo(latestVerdict.timestamp) : 'waiting', tone: latestVerdict ? verdictTone(latestVerdict) : 'muted' },
          ]}
        />

        <OpsPanel
          eyebrow="CORE"
          title="Guardian"
          status={latestVerdict?.level ?? 'WAITING'}
          statusTone={verdictTone(latestVerdict)}
          primary={latestVerdict ? String(latestVerdict.score) : '--'}
          caption={weakest ? `${weakest.name}: ${weakest.reason}` : 'The next token scan will populate the five-layer security verdict.'}
          rows={[
            { label: 'checks', value: latestVerdict ? `${latestVerdict.checks.length}/5` : '0/5', tone: latestVerdict ? 'safe' : 'muted' },
            { label: 'weakest layer', value: weakest?.name ?? 'none', tone: weakest ? verdictTone(latestVerdict) : 'muted' },
            { label: 'latency', value: latestVerdict ? `${latestVerdict.executionTimeMs}ms` : '--', tone: 'info' },
          ]}
        >
          <Link to="/security" className="font-mono text-[11px] uppercase tracking-widest text-accent-safe hover:text-primary">
            Open security console →
          </Link>
        </OpsPanel>

        <OpsPanel
          eyebrow="TRADING"
          title="Executor"
          status={latestTrade?.status ?? 'READY'}
          statusTone={tradeTone(latestTrade)}
          primary={latestTrade ? latestTrade.type.toUpperCase() : `${confirmedTrades}`}
          caption={latestTrade ? `${latestTrade.type.toUpperCase()} ${formatTokenAmount(latestTrade.amountIn)} USDT of ${latestTrade.tokenSymbol}.` : 'Waiting for a GO verdict before sending any swap transaction.'}
          rows={[
            { label: 'confirmed', value: String(confirmedTrades), tone: confirmedTrades > 0 ? 'safe' : 'muted' },
            { label: 'capacity', value: formatMoney(capacity), tone: capacity > 0 ? 'safe' : 'caution' },
            { label: 'last trade', value: latestTrade ? timeAgo(latestTrade.timestamp) : 'none', tone: tradeTone(latestTrade) },
          ]}
        >
          {latestTrade?.txHash ? (
            <a className="font-mono text-[11px] uppercase tracking-widest text-accent-info hover:text-primary" href={oklinkTxUrl(latestTrade.txHash)} target="_blank" rel="noreferrer">
              View OKLink tx →
            </a>
          ) : null}
        </OpsPanel>

        <OpsPanel
          eyebrow="LOOP B"
          title="Sentinel"
          status={latestThreat ? latestThreat.severity.toUpperCase() : 'CLEAR'}
          statusTone={threatTone(latestThreat)}
          primary={String(state.positions.length)}
          caption={latestThreat ? latestThreat.description : 'No current threats in state. Open positions are rechecked on the defense interval.'}
          rows={[
            { label: 'monitor', value: formatInterval(state.config.monitorIntervalMs), tone: 'info' },
            { label: 'latest alert', value: latestThreat ? timeAgo(latestThreat.timestamp) : 'none', tone: threatTone(latestThreat) },
            { label: 'action', value: latestThreat?.action ?? 'watch', tone: latestThreat?.action === 'auto-exit' ? 'danger' : 'safe' },
          ]}
        />

        <OpsPanel
          eyebrow="WALLET"
          title="Profile"
          status={state.walletAddress ? 'BOUND' : 'UNSET'}
          statusTone={state.walletAddress ? 'safe' : 'caution'}
          primary={formatMoney(state.walletBalance)}
          caption={state.walletAddress ? `Agent wallet ${truncateAddress(state.walletAddress, 10, 6)} on X Layer chain ${state.config.chainId}.` : 'Set AGENT_WALLET_ADDRESS and PRIVATE_KEY locally before live swaps.'}
          rows={[
            { label: 'exposure', value: formatMoney(exposure), tone: exposure > 0 ? 'caution' : 'safe' },
            { label: 'max portfolio', value: formatMoney(state.config.maxPortfolioSizeUsdt), tone: 'info' },
            { label: 'rpc', value: state.config.rpcUrl.replace(/^https?:\/\//, ''), tone: 'muted' },
          ]}
        >
          <Link to="/portfolio" className="font-mono text-[11px] uppercase tracking-widest text-accent-safe hover:text-primary">
            Open portfolio →
          </Link>
        </OpsPanel>

        <OpsPanel
          eyebrow="PAYMENTS"
          title="x402"
          status={state.config.x402Enabled ? 'ENABLED' : 'DISABLED'}
          statusTone={state.config.x402Enabled ? 'safe' : 'muted'}
          primary={formatMoney(x402Net, 3)}
          caption={latestX402Label(latestX402)}
          rows={[
            { label: 'price/check', value: formatMoney(state.config.x402PricePerCheck, 3), tone: 'info' },
            { label: 'network', value: state.config.x402Network.toUpperCase(), tone: state.config.x402Enabled ? 'safe' : 'muted' },
            { label: 'entries', value: String(state.x402Transactions.length), tone: state.x402Transactions.length > 0 ? 'safe' : 'muted' },
          ]}
        >
          <div className="flex flex-wrap gap-3">
            <Link to="/economics" className="font-mono text-[11px] uppercase tracking-widest text-accent-safe hover:text-primary">
              Open economics →
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-widest text-secondary">
              MCP: {state.config.mcpTransport.toUpperCase()} · AI: {state.config.aiProvider === 'gemini' ? state.config.aiModel : 'LOCAL'}
            </span>
          </div>
        </OpsPanel>
      </div>
    </section>
  );
}
