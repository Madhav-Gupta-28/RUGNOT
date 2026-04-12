import { EconChart } from '../components/EconChart';
import { formatMoney, timeAgo } from '../lib/format';
import { useRugnotStore } from '../store';

export function EconomicsPage() {
  const state = useRugnotStore((store) => store.state);
  const netProfit = state.x402TotalEarned - state.x402TotalSpent;

  return (
    <div className="mx-auto max-w-7xl space-y-12 mt-4">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
           <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">NETWORK ECONOMICS</div>
           <h1 className="font-sans text-3xl font-bold text-primary tracking-tight">X-402 Protocol Yield</h1>
        </div>
        <div className="flex gap-8 sm:gap-12 text-left md:text-right">
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">TOTAL EARNED</div>
             <div className="font-mono text-2xl text-accent-safe">${state.x402TotalEarned.toFixed(3)}</div>
           </div>
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">OPERATING COSTS</div>
             <div className="font-mono text-2xl text-accent-caution">${state.x402TotalSpent.toFixed(3)}</div>
           </div>
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">NET PROFIT</div>
             <div className="font-mono text-2xl text-primary">${netProfit.toFixed(3)}</div>
           </div>
        </div>
      </div>

      <div className="mt-8">
         <EconChart transactions={state.x402Transactions} />
      </div>

      <section className="terminal-panel rounded-md mb-12">
        <div className="border-b border-[#1a1a1a] p-4 sm:p-6 flex flex-wrap items-center justify-between">
          <h2 className="font-sans text-lg font-bold text-primary uppercase tracking-tight">Transaction Ledger</h2>
          <div className="font-mono text-[10px] text-secondary tracking-widest uppercase">{state.x402Transactions.length} ENTRIES</div>
        </div>
        {state.x402Transactions.length === 0 ? (
          <div className="p-16 md:p-24 text-center">
            <div className="font-mono text-[10px] uppercase text-secondary mb-2 tracking-widest">NO TRANSACTIONS RECORDED</div>
            <p className="font-sans text-sm text-secondary">
               External protocol security check revenues will stream here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {state.x402Transactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-wrap items-center gap-4 px-4 sm:px-6 py-4 hover:bg-[#0a0a0a] transition group">
                <span className={`font-mono text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full border ${transaction.direction === 'earned' ? 'text-accent-safe border-accent-safe bg-accent-safe/10' : 'text-accent-caution border-accent-caution bg-accent-caution/10'}`}>
                  {transaction.direction === 'earned' ? '+' : '-'}
                </span>
                <span className="font-mono text-sm text-primary min-w-[80px]">{formatMoney(transaction.amount, 3)}</span>
                <span className="min-w-0 flex-1 font-mono text-xs text-secondary group-hover:text-primary transition uppercase">{transaction.service.replace(/-/g, ' ')}</span>
                <time className="font-mono text-[10px] tracking-widest text-secondary/60">{timeAgo(transaction.timestamp)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
