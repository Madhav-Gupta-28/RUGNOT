import { useMemo, useState } from 'react';

import { SecurityBadge } from '../components/SecurityBadge';
import { timeAgo, truncateAddress } from '../lib/format';
import type { Verdict, VerdictLevel } from '../lib/types';
import { useRugnotStore } from '../store';

type Filter = 'ALL' | VerdictLevel;

const filters: Filter[] = ['ALL', 'GO', 'CAUTION', 'DANGER'];

const dormantVerdict: Verdict = {
  tokenAddress: '0x0000000000000000000000000000000000000196',
  chain: 'xlayer' as const,
  level: 'CAUTION' as const,
  score: 50,
  timestamp: Date.now(),
  executionTimeMs: 0,
  checks: [
    { name: 'Contract Safety', passed: true, score: 50, reason: 'Awaiting contract scan' },
    { name: 'Holder Analysis', passed: true, score: 50, reason: 'Awaiting holder map' },
    { name: 'Smart Money', passed: true, score: 50, reason: 'Awaiting signal flow' },
    { name: 'Liquidity', passed: true, score: 50, reason: 'Awaiting route probe' },
    { name: 'Tx Simulation', passed: true, score: 50, reason: 'Awaiting simulation' },
  ],
};

function countLevel(verdicts: Verdict[], level: VerdictLevel): number {
  return verdicts.filter((verdict) => verdict.level === level).length;
}

export function SecurityPage() {
  const verdicts = useRugnotStore((store) => store.state.recentVerdicts);
  const [filter, setFilter] = useState<Filter>('ALL');

  const filteredVerdicts = useMemo(() => {
    if (filter === 'ALL') return verdicts;
    return verdicts.filter((verdict) => verdict.level === filter);
  }, [filter, verdicts]);
  
  const selectedVerdict = filteredVerdicts[0] ?? dormantVerdict;

  return (
    <div className="mx-auto max-w-7xl space-y-16 mt-4">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
           <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">THREAT RESOLUTION REPORT</div>
           <h1 className="font-sans text-3xl font-bold text-primary tracking-tight">
             {selectedVerdict === dormantVerdict ? 'Awaiting Scan' : truncateAddress(selectedVerdict.tokenAddress, 16, 4)}
           </h1>
        </div>
        <div className="flex flex-wrap gap-8 sm:gap-12 text-left md:text-right items-end">
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">CRITICAL SCORE</div>
             <div className="font-mono text-2xl text-primary">{selectedVerdict.score}/100</div>
           </div>
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">LATENCY</div>
             <div className="font-mono text-2xl text-primary">{selectedVerdict.executionTimeMs}ms</div>
           </div>
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">STATE</div>
             <div className="pb-1"><SecurityBadge level={selectedVerdict.level} /></div>
           </div>
        </div>
      </div>

      <div className="terminal-panel rounded-md p-4 sm:p-6 mb-12">
        <h2 className="font-sans text-lg font-bold text-primary uppercase tracking-tight mb-4">GUARDIAN PIPELINE LOG</h2>
        <div className="divide-y divide-[#1a1a1a]">
          {selectedVerdict.checks.map((check, index) => (
            <div key={check.name} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                 <span className={`font-mono text-[10px] w-5 h-5 flex items-center justify-center rounded-sm ${check.passed ? 'bg-accent-safe/10 text-accent-safe' : 'bg-accent-danger/10 text-accent-danger'}`}>{index + 1}</span>
                 <div>
                   <div className="font-sans text-sm font-bold text-primary uppercase leading-none mb-1">{check.name}</div>
                   <div className="font-mono text-[10px] text-secondary/70">{check.reason}</div>
                 </div>
               </div>
               <div className="flex items-center gap-6">
                  <div className="text-left sm:text-right mt-2 sm:mt-0">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-secondary mb-1">CHECK SCORE</div>
                    <div className="font-mono text-sm text-primary">{check.score}</div>
                  </div>
                  <div className={`font-mono text-[9px] font-bold tracking-widest uppercase px-3 py-1 mt-2 sm:mt-0 rounded text-center border w-[4.5rem] ${check.passed ? 'border-accent-safe bg-accent-safe/10 text-accent-safe' : 'border-accent-danger bg-accent-danger/10 text-accent-danger'}`}>
                    {check.passed ? 'PASS' : 'BLOCK'}
                  </div>
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historical Scans */}
      <section className="terminal-panel rounded-md p-4 sm:p-6 mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1a1a1a] pb-4 mb-4 gap-4">
            <h2 className="font-sans text-lg font-bold text-primary tracking-tight uppercase">Historical Verdicts</h2>
            <div className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`font-mono text-[9px] tracking-widest px-3 py-1.5 rounded transition border ${filter === f ? 'border-accent-safe text-accent-safe bg-accent-safe/10' : 'border-border text-secondary hover:text-primary hover:border-secondary'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          
          <div className="divide-y divide-[#1a1a1a]">
            {filteredVerdicts.length === 0 ? (
               <div className="text-center font-mono text-xs text-secondary/70 py-12 uppercase tracking-widest">NO VERDICTS RECORDED</div>
            ) : null}

            {filteredVerdicts.map((v) => (
               <div key={`${v.tokenAddress}-${v.timestamp}`} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 hover:bg-[#0a0a0a] transition px-3 -mx-3 rounded cursor-pointer group">
                  <div className="flex items-center gap-4 mb-2 sm:mb-0">
                    <SecurityBadge level={v.level} />
                    <span className="font-mono text-xs text-primary group-hover:text-accent-safe transition">{truncateAddress(v.tokenAddress, 16, 8)}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-sm text-primary w-8 text-right">{v.score}</span>
                    <span className="font-mono text-[10px] text-secondary/60 w-16 text-right uppercase tracking-widest">{timeAgo(v.timestamp)}</span>
                  </div>
               </div>
            ))}
          </div>
      </section>
    </div>
  );
}
