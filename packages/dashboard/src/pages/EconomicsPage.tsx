import { EconChart } from '../components/EconChart';
import { formatMoney, timeAgo } from '../lib/format';
import { useRugnotStore } from '../store';

interface StatCardProps {
  label: string;
  value: string;
  tone: 'safe' | 'caution' | 'info';
}

const toneClasses: Record<StatCardProps['tone'], string> = {
  safe: 'text-accent-safe',
  caution: 'text-accent-caution',
  info: 'text-accent-info',
};

function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <div className={`font-mono text-3xl font-bold ${toneClasses[tone]}`}>{value}</div>
      <div className="mt-2 font-sans text-sm text-secondary">{label}</div>
    </div>
  );
}

export function EconomicsPage() {
  const state = useRugnotStore((store) => store.state);
  const netProfit = state.x402TotalEarned - state.x402TotalSpent;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-sans text-2xl font-bold text-primary">Economics</h1>
        <p className="mt-1 font-sans text-sm text-secondary">x402 revenue from paid security scans and agent spend.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Earned" value={`$${state.x402TotalEarned.toFixed(3)}`} tone="safe" />
        <StatCard label="Total Spent" value={`$${state.x402TotalSpent.toFixed(3)}`} tone="caution" />
        <StatCard label="Net Profit" value={`$${netProfit.toFixed(3)}`} tone="info" />
      </section>

      <EconChart transactions={state.x402Transactions} />

      <section className="rounded-xl border border-border bg-bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="font-sans text-lg font-bold text-primary">Transactions</h2>
        </div>
        {state.x402Transactions.length === 0 ? (
          <div className="p-8 text-center font-sans text-sm text-secondary">
            No x402 transactions yet. External security checks will show up as revenue here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {state.x402Transactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`font-mono text-lg ${transaction.direction === 'earned' ? 'text-accent-safe' : 'text-accent-caution'}`}>
                  {transaction.direction === 'earned' ? '↑' : '↓'}
                </span>
                <span className="font-mono text-sm text-primary">{formatMoney(transaction.amount, 3)}</span>
                <span className="min-w-0 flex-1 font-sans text-sm text-secondary">{transaction.service.replace(/-/g, ' ')}</span>
                <time className="font-mono text-xs text-secondary">{timeAgo(transaction.timestamp)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
