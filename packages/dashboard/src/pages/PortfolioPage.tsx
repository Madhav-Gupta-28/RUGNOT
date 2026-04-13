import { useState } from 'react';
import { PnlChart } from '../components/PnlChart';
import { PositionRow } from '../components/PositionRow';
import { useRugnotStore } from '../store';
import { formatMoney, formatTokenAmount, timeAgo, truncateAddress } from '../lib/format';
import { apiPost } from '../lib/api';

const OKLINK_TX = (hash: string) => `https://www.oklink.com/x-layer/tx/${hash}`;
const isRealHash = (h?: string) => !!h && /^0x[a-fA-F0-9]{64}$/.test(h);

export function PortfolioPage() {
  const [isSellingAll, setIsSellingAll] = useState(false);
  const { positions, recentTrades } = useRugnotStore((store) => store.state);
  const portfolioValue = positions.reduce((sum, p) => sum + p.amount * p.currentPrice, 0);
  const totalPnl = positions.reduce((sum, p) => sum + (p.pnlUsd ?? 0), 0);
  const pnlSign = totalPnl >= 0 ? '+' : '';

  const handleSellAll = async () => {
    if (!confirm('Are you sure you want to sell all active positions?')) return;
    try {
      setIsSellingAll(true);
      await apiPost('/api/positions/sell-all', {});
    } catch (err) {
      console.error(err);
      alert('Failed to sell all');
    } finally {
      setIsSellingAll(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 mt-4">
      {/* Ribbon header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">LIVE EXPOSURE</div>
          <h1 className="font-sans text-3xl font-bold text-primary tracking-tight">Active Portfolio</h1>
        </div>
        <div className="flex gap-8 sm:gap-12 text-left md:text-right">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">TOTAL VALUE</div>
            <div className="font-mono text-2xl text-primary">{formatMoney(portfolioValue)}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">NETWORK PNL</div>
            <div className={`font-mono text-2xl ${totalPnl >= 0 ? 'text-accent-safe' : 'text-accent-danger'}`}>
              {pnlSign}{formatMoney(totalPnl)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">TRACKED</div>
            <div className="font-mono text-2xl text-primary">{positions.length}</div>
          </div>
        </div>
      </div>

      {/* Open positions */}
      <div className="terminal-panel rounded-md">
        <div className="border-b border-[#1a1a1a] p-4 sm:p-6 flex items-center justify-between gap-4">
          <h2 className="font-sans text-lg font-bold text-primary tracking-tight">Open Positions</h2>
          <button
            onClick={handleSellAll}
            disabled={isSellingAll || positions.length === 0}
            className="rounded border border-accent-danger/30 bg-accent-danger/10 px-4 py-2 font-mono text-[10px] tracking-widest uppercase text-accent-danger hover:bg-accent-danger hover:text-bg transition disabled:opacity-50"
          >
            {isSellingAll ? 'SELLING ALL...' : 'EMERGENCY SELL ALL'}
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="font-mono text-[10px] uppercase tracking-widest text-secondary mb-3">NO OPEN POSITIONS</div>
            <p className="font-sans text-sm text-secondary/70">Agent exited all positions or is scanning for new entries.</p>
            <p className="font-mono text-[10px] text-secondary/50 mt-2">See trade history below ↓</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-[#050505]">
                  {['Token', 'Amount', 'Entry', 'Current', 'PnL', 'Security', 'Last Check', 'Actions'].map((col) => (
                    <th key={col} className="px-6 py-4 text-left font-mono text-[11px] tracking-widest font-bold uppercase text-secondary">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <PositionRow key={position.tokenAddress} position={position} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade ledger — always visible, proves execution with OKLink hashes. */}
      {recentTrades.length > 0 && (
        <div className="terminal-panel rounded-md">
          <div className="border-b border-[#1a1a1a] p-4 sm:p-6 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-1">ON-CHAIN HISTORY</div>
              <h2 className="font-sans text-lg font-bold text-primary">Trade Ledger</h2>
            </div>
            <div className="font-mono text-[10px] text-secondary/50">{recentTrades.length} executions</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-[#050505]">
                  {['Time', 'Type', 'Token', 'Amount In', 'Amount Out', 'Status', 'TX Hash'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-mono text-[10px] tracking-widest uppercase text-secondary">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade) => {
                  const isBuy = trade.type === 'buy';
                  const confirmed = trade.status === 'confirmed';
                  const hasHash = isRealHash(trade.txHash);
                  return (
                    <tr key={trade.id} className="border-b border-[#0f0f0f] last:border-0 hover:bg-[#0a0a0a] transition-colors">
                      <td className="px-4 py-3 font-mono text-[10px] text-secondary/70">{timeAgo(trade.timestamp)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-[9px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded ${isBuy ? 'border-accent-safe/30 bg-accent-safe/10 text-accent-safe' : 'border-accent-danger/30 bg-accent-danger/10 text-accent-danger'}`}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-primary font-bold">{trade.tokenSymbol}</td>
                      <td className="px-4 py-3 font-mono text-xs text-secondary">{formatTokenAmount(trade.amountIn)} USDT</td>
                      <td className="px-4 py-3 font-mono text-xs text-secondary">{formatTokenAmount(trade.amountOut)} {isBuy ? trade.tokenSymbol : 'USDT'}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-[9px] tracking-widest uppercase ${confirmed ? 'text-accent-safe' : trade.status === 'failed' ? 'text-accent-danger' : 'text-accent-caution'}`}>
                          {trade.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {hasHash ? (
                          <a href={OKLINK_TX(trade.txHash!)} target="_blank" rel="noreferrer"
                            className="font-mono text-[10px] text-accent-safe hover:underline flex items-center gap-1">
                            {truncateAddress(trade.txHash!, 6, 4)} ↗
                          </a>
                        ) : (
                          <span className="font-mono text-[10px] text-secondary/30 italic">demo tx</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6">
        <PnlChart positions={positions} trades={recentTrades} />
      </div>
    </div>
  );
}
