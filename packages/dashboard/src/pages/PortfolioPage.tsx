import { PnlChart } from '../components/PnlChart';
import { PositionRow } from '../components/PositionRow';
import { useRugnotStore } from '../store';
import { formatMoney } from '../lib/format';

export function PortfolioPage() {
  const { positions, recentTrades, walletAddress } = useRugnotStore((store) => store.state);
  const portfolioValue = positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-12 mt-4">
      <section className="mb-12">
        <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-3">PORTFOLIO TERMINAL</div>
        <h1 className="font-sans text-4xl lg:text-5xl font-bold text-primary mb-4 tracking-tighter">GUARDIAN WALLET VAULT</h1>
        <p className="font-sans text-lg text-secondary/80 max-w-3xl leading-relaxed">
          Track active positions, mark-to-market PnL, and agent-managed capital exposure protected by Guardian checks and Sentinel monitoring.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <div className="border border-border bg-bg/40 rounded-lg p-6 flex flex-col justify-between h-[150px] transition hover:border-accent-safe/40 group">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-secondary group-hover:border-accent-safe/50 group-hover:text-accent-safe transition">↓</div>
             <div className="font-mono text-[11px] tracking-widest uppercase text-secondary group-hover:text-primary transition">MAX EXPOSURE</div>
          </div>
          <div>
            <div className="font-sans text-4xl lg:text-5xl font-light text-primary tracking-tight">{formatMoney(portfolioValue)}</div>
          </div>
        </div>
        
        <div className="border border-border bg-bg/40 rounded-lg p-6 flex flex-col justify-between h-[150px] transition hover:border-accent-safe/40 group">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-secondary group-hover:border-accent-safe/50 group-hover:text-accent-safe transition">~</div>
             <div className="font-mono text-[11px] tracking-widest uppercase text-secondary group-hover:text-primary transition">POSITIONS PNL</div>
          </div>
          <div>
            <div className="font-sans text-4xl lg:text-5xl font-light text-primary tracking-tight">+0.00%</div>
          </div>
        </div>

        <div className="border border-border bg-bg/40 rounded-lg p-6 flex flex-col justify-between h-[150px] transition hover:border-accent-safe/40 group">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-secondary group-hover:border-accent-safe/50 group-hover:text-accent-safe transition">⛨</div>
             <div className="font-mono text-[11px] tracking-widest uppercase text-secondary group-hover:text-primary transition">ACTIVE POSITIONS</div>
          </div>
          <div className="flex items-baseline gap-3">
            <div className="font-sans text-4xl lg:text-5xl font-light text-primary tracking-tight">{positions.length}</div>
            <div className="font-mono text-[10px] text-secondary/60 uppercase">Tracked</div>
          </div>
        </div>
      </section>

      <div className="border border-border rounded-xl bg-bg/40 overflow-hidden shadow-lg mt-12 mb-12">
        <div className="border-b border-border p-6 flex items-center justify-between bg-bg/80">
          <h2 className="font-sans text-xl font-bold text-primary tracking-tight">SECURE POSITIONS</h2>
          <button className="rounded border border-accent-safe/30 bg-accent-safe/10 px-6 py-3 font-mono text-[11px] tracking-widest font-bold text-accent-safe hover:bg-accent-safe hover:text-bg hover:shadow-[0_0_15px_rgba(188,255,47,0.3)] transition">
            + NEW PROPOSAL
          </button>
        </div>
        
        {!walletAddress ? (
          <div className="p-32 flex flex-col items-center justify-center text-center">
            <svg className="w-16 h-16 text-secondary/40 mb-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
               <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
               <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
               <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
            <h3 className="font-sans text-2xl font-bold text-primary mb-3">Wallet Disconnected</h3>
            <p className="font-sans text-base text-secondary/80 max-w-md mx-auto">Connect your wallet to view your active secure positions and tracked assets.</p>
          </div>
        ) : positions.length === 0 ? (
          <div className="p-32 flex flex-col items-center justify-center text-center">
            <h3 className="font-sans text-2xl font-bold text-primary mb-3">No Active Exposure</h3>
            <p className="font-sans text-base text-secondary/80">The agent is currently scanning for secure opportunities.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-[#050505]">
                  {['Token', 'Amount', 'Entry', 'Current', 'PnL', 'Security', 'Last Check'].map((column) => (
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
