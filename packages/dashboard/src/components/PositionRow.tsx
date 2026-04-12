import { useState } from 'react';
import { formatMoney, formatTokenAmount, timeAgo, truncateAddress } from '../lib/format';
import type { Position } from '../lib/types';
import { apiPost } from '../lib/api';
import { SecurityBadge } from './SecurityBadge';

interface PositionRowProps {
  position: Position;
}

export function PositionRow({ position }: PositionRowProps) {
  const [isSelling, setIsSelling] = useState(false);
  const pnlClass = position.pnlPercent >= 0 ? 'text-accent-safe' : 'text-accent-danger';

  const handleSell = async () => {
    try {
      setIsSelling(true);
      await apiPost(`/api/positions/${position.tokenAddress}/sell`, {});
    } catch (err) {
      console.error(err);
      alert('Failed to sell');
    } finally {
      setIsSelling(false);
    }
  };

  return (
    <tr className="border-b border-border bg-bg-surface transition hover:bg-bg-elevated">
      <td className="px-4 py-3">
        <div className="font-sans text-sm font-bold text-primary">{position.tokenSymbol}</div>
        <div className="font-mono text-xs text-secondary">{truncateAddress(position.tokenAddress)}</div>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-primary">{formatTokenAmount(position.amount)}</td>
      <td className="px-4 py-3 font-mono text-sm text-primary">{formatMoney(position.entryPrice, 4)}</td>
      <td className="px-4 py-3 font-mono text-sm text-primary">{formatMoney(position.currentPrice, 4)}</td>
      <td className={`px-4 py-3 font-mono text-sm font-bold ${pnlClass}`}>
        {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
      </td>
      <td className="px-4 py-3"><SecurityBadge level={position.lastVerdictLevel} /></td>
      <td className="px-4 py-3 font-mono text-xs text-secondary">
        {position.lastSecurityCheck > 0 ? timeAgo(position.lastSecurityCheck) : 'pending'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleSell}
          disabled={isSelling}
          className="rounded border border-accent-danger/30 bg-accent-danger/10 px-3 py-1 font-mono text-[10px] tracking-widest font-bold text-accent-danger hover:bg-accent-danger hover:text-bg transition disabled:opacity-50"
        >
          {isSelling ? 'SELLING...' : 'SELL'}
        </button>
      </td>
    </tr>
  );
}
