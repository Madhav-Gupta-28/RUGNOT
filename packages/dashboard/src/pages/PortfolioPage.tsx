import { PnlChart } from '../components/PnlChart';
import { PositionRow } from '../components/PositionRow';
import { useRugnotStore } from '../store';

export function PortfolioPage() {
  const { positions, recentTrades } = useRugnotStore((store) => store.state);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-sans text-2xl font-bold text-primary">Portfolio</h1>
        <p className="mt-1 font-sans text-sm text-secondary">Open positions, mark-to-market PnL, and last guardian verdict.</p>
      </section>

      <PnlChart positions={positions} trades={recentTrades} />

      <section className="rounded-xl border border-border bg-bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="font-sans text-lg font-bold text-primary">Positions</h2>
        </div>
        {positions.length === 0 ? (
          <div className="p-8 text-center font-sans text-sm text-secondary">
            No active positions. The agent will find safe opportunities.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-bg">
                  {['Token', 'Amount', 'Entry Price', 'Current Price', 'PnL %', 'Security', 'Last Check'].map((column) => (
                    <th key={column} className="px-4 py-3 text-left font-sans text-xs font-bold uppercase text-secondary">
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
      </section>
    </div>
  );
}
