import { EconChart } from '../components/EconChart';
import { formatMoney, timeAgo } from '../lib/format';
import { useRugnotStore } from '../store';

interface StatCardProps {
  label: string;
  value: string;
  tone: 'safe' | 'caution' | 'info';
  caption: string;
}

const toneClasses: Record<StatCardProps['tone'], string> = {
  safe: 'text-accent-safe',
  caution: 'text-accent-caution',
  info: 'text-accent-info',
};

function StatCard({ label, value, tone, caption }: StatCardProps) {
  return (
    <div className="border border-border bg-bg/40 rounded-lg p-6 transition hover:border-accent-safe/40 hover:bg-bg/60 group shadow-sm">
      <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-6 group-hover:text-primary transition">{label}</div>
      <div className={`font-sans text-4xl lg:text-5xl font-light mb-3 tracking-tight ${toneClasses[tone]}`}>{value}</div>
      <div className="font-mono text-xs text-secondary/70">{caption}</div>
    </div>
  );
}

export function EconomicsPage() {
  const state = useRugnotStore((store) => store.state);
  const netProfit = state.x402TotalEarned - state.x402TotalSpent;

  return (
    <div className="mx-auto max-w-7xl space-y-12 mt-4">
      <section className="mb-12">
        <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-3">NETWORK ECONOMICS</div>
        <h1 className="font-sans text-4xl lg:text-5xl font-bold text-primary mb-4 tracking-tighter">X-402 PROTOCOL YIELD</h1>
        <p className="font-sans text-lg text-secondary/80 max-w-3xl leading-relaxed">
          Monitor revenue from paid security checks, live agent costs, and the earn-pay-earn loop that keeps RUGNOT scanning.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <StatCard label="TOTAL EARNED" value={`$${state.x402TotalEarned.toFixed(3)}`} tone="safe" caption="Revenue from global security scans" />
        <StatCard label="TOTAL SPENT" value={`$${state.x402TotalSpent.toFixed(3)}`} tone="caution" caption="Signal data and operating costs" />
        <StatCard label="NET PROTOCOL PROFIT" value={`$${netProfit.toFixed(3)}`} tone="info" caption="Overall protocol capital efficiency" />
      </section>

      <div className="mt-16">
         <EconChart transactions={state.x402Transactions} />
      </div>

      <section className="terminal-panel border border-border rounded-xl bg-bg/40 shadow-lg mt-12 mb-12">
        <div className="border-b border-border p-6 flex flex-wrap items-center justify-between bg-bg/80">
          <h2 className="font-sans text-xl font-bold text-primary uppercase tracking-tight">TRANSACTION LEDGER</h2>
          <div className="font-mono text-[11px] text-secondary tracking-widest uppercase border border-border rounded-full px-4 py-1 bg-bg">{state.x402Transactions.length} ENTRIES</div>
        </div>
        {state.x402Transactions.length === 0 ? (
          <div className="p-24 text-center">
            <div className="font-mono text-[11px] uppercase text-secondary/60 mb-3 tracking-widest">NO X402 TRANSACTIONS RECORDED</div>
            <p className="font-sans text-base text-secondary/80">
               External protocol security check revenues executed on X Layer will stream here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {state.x402Transactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-wrap items-center gap-6 px-8 py-6 hover:bg-bg-elevated/70 transition group">
                <span className={`font-mono text-sm font-bold flex items-center justify-center w-8 h-8 rounded-full border shadow-sm ${transaction.direction === 'earned' ? 'text-accent-safe border-accent-safe bg-accent-safe/10 shadow-[0_0_10px_rgba(188,255,47,0.2)]' : 'text-accent-caution border-accent-caution bg-accent-caution/10'}`}>
                  {transaction.direction === 'earned' ? '+' : '-'}
                </span>
                <span className="font-mono text-xl text-primary font-light min-w-[100px]">{formatMoney(transaction.amount, 3)}</span>
                <span className="min-w-0 flex-1 font-sans text-base text-secondary/90 group-hover:text-primary transition">{transaction.service.replace(/-/g, ' ').toUpperCase()}</span>
                <time className="font-mono text-[11px] tracking-widest text-secondary/60">{timeAgo(transaction.timestamp)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
