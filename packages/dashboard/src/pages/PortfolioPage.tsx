import { useState } from 'react';
import { PnlChart } from '../components/PnlChart';
import { PositionRow } from '../components/PositionRow';
import { useRugnotStore } from '../store';
import { formatMoney } from '../lib/format';
import { apiPost } from '../lib/api';

export function PortfolioPage() {
  const [isSellingAll, setIsSellingAll] = useState(false);
  const { positions, recentTrades, walletAddress } = useRugnotStore((store) => store.state);
  const portfolioValue = positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);

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
    <div className="mx-auto max-w-7xl space-y-12 mt-4">
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
             <div className="font-mono text-2xl text-accent-safe">+0.00%</div>
           </div>
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">TRACKED</div>
             <div className="font-mono text-2xl text-primary">{positions.length}</div>
           </div>
        </div>
      </div>

      <div className="terminal-panel rounded-md mb-12">
        <div className="border-b border-[#1a1a1a] p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="font-sans text-lg font-bold text-primary tracking-tight">Secure Positions</h2>
          <div className="flex gap-3">
            <button
              onClick={handleSellAll}
              disabled={isSellingAll || positions.length === 0}
              className="rounded border border-accent-danger/30 bg-accent-danger/10 px-4 py-2 font-mono text-[10px] tracking-widest uppercase text-accent-danger hover:bg-accent-danger hover:text-bg transition disabled:opacity-50"
            >
              {isSellingAll ? 'SELLING ALL...' : 'EMERGENCY SELL ALL'}
            </button>
            <button className="rounded border border-[#333333] hover:border-accent-safe bg-transparent px-4 py-2 font-mono text-[10px] tracking-widest uppercase text-secondary hover:text-accent-safe transition">
              + NEW PROPOSAL
            </button>
          </div>
        </div>
        
        {!walletAddress ? (
          <div className="p-16 md:p-24 flex flex-col items-center justify-center text-center">
            <h3 className="font-sans text-lg font-bold text-primary mb-2">Wallet Disconnected</h3>
            <p className="font-sans text-sm text-secondary max-w-md mx-auto">Connect your wallet to view your active secure positions and tracked assets.</p>
          </div>
        ) : positions.length === 0 ? (
          <div className="p-16 md:p-24 flex flex-col items-center justify-center text-center">
            <h3 className="font-sans text-lg font-bold text-primary mb-2">No Active Exposure</h3>
            <p className="font-sans text-sm text-secondary">The agent is currently scanning for secure opportunities.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-[#050505]">
                  {['Token', 'Amount', 'Entry', 'Current', 'PnL', 'Security', 'Last Check', 'Actions'].map((column) => (
                    <th key={column} className="px-6 py-4 text-left font-mono text-[11px] tracking-widest font-bold uppercase text-secondary">
                      {column}
                    </th>
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

      <div className="mt-16">
         <PnlChart positions={positions} trades={recentTrades} />
      </div>
    </div>
  );
}
