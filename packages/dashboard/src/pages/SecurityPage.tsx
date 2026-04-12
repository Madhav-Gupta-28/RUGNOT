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
      {/* Top Header - Matches Ascend Round Terminal */}
      <section className="terminal-panel rounded-xl border border-border p-6 md:p-8 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 p-8 opacity-10 font-mono text-[6rem] font-bold leading-none select-none pointer-events-none">OKX</div>
        
        <div className="relative z-10">
          <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-4">MPC GUARDIAN TERMINAL</div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-border/50 gap-6">
            <h1 className="font-sans text-3xl sm:text-4xl lg:text-5xl font-bold text-primary tracking-tighter uppercase">
               {selectedVerdict === dormantVerdict ? 'AWAITING SCAN' : truncateAddress(selectedVerdict.tokenAddress, 16, 4)}
            </h1>
            <div className="flex items-center gap-4 border border-border rounded-full px-6 py-3 bg-[#050505]">
               <span className="font-mono text-xs uppercase text-secondary">THRESHOLD CONSENSUS</span>
               <SecurityBadge level={selectedVerdict.level} />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-secondary mb-4">CRITICAL SCORE</div>
              <div className={`font-mono text-4xl font-light tracking-tight ${selectedVerdict.level === 'GO' ? 'text-accent-safe' : selectedVerdict.level === 'DANGER' ? 'text-accent-danger' : 'text-accent-caution'}`}>
                {selectedVerdict.score}/100
              </div>
            </div>
            <div>
               <div className="font-mono text-[11px] uppercase tracking-widest text-secondary mb-4">NODE EXECUTION</div>
               <div className="font-mono text-4xl font-light text-accent-safe tracking-tight">{selectedVerdict.executionTimeMs}ms</div>
            </div>
            <div>
               <div className="font-mono text-[11px] uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">BLOCKCHAIN <span className="text-secondary/70 text-[9px] border border-secondary/40 px-1.5 py-0.5 rounded">EVM</span></div>
               <div className="font-mono text-4xl font-light text-primary flex items-center gap-3 uppercase tracking-tight">
                 <span className="text-accent-safe">↑</span> {selectedVerdict.chain}
               </div>
            </div>
            <div>
               <div className="font-mono text-[11px] uppercase tracking-widest text-secondary mb-4">PIPELINE STATUS</div>
               <div className="font-mono text-2xl font-bold text-primary mt-1 tracking-tight">RESOLVED <span className={selectedVerdict.level === 'GO' ? 'text-accent-safe' : 'text-accent-danger'}>{selectedVerdict.level}</span></div>
               <div className="font-mono text-[11px] text-secondary/70 mt-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent-safe animate-pulse-safe" /> STITCHED 5/5 CHECKS</div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid of checks (Stitch MPC cryptographic node visual) */}
      <section className="py-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
           <div>
             <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-3">STITCH MPC NODE VERIFICATION</div>
             <h2 className="font-sans text-3xl font-bold text-primary tracking-tight">LAYERED SECURITY DEFENSE</h2>
           </div>
           <div className="font-mono text-[11px] tracking-widest text-accent-safe uppercase border border-accent-safe/30 bg-accent-safe/10 px-4 py-2 rounded-full hidden sm:block">PIPELINE #196 ALIGNED</div>
        </div>

        {/* Nodes Grid */}
        <div className="grid md:grid-cols-2 gap-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-[1px] border-t border-dashed border-border/60 hidden md:block z-0 pointer-events-none" />
          
          {selectedVerdict.checks.map((check, index) => (
             <div key={check.name} className="border border-border rounded-lg p-6 bg-bg/60 backdrop-blur-sm z-10 transition hover:border-accent-safe/40 hover:shadow-[0_0_30px_rgba(188,255,47,0.05)]">
               <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/50">
                  <div className="flex items-center gap-5">
                     <div className="w-12 h-12 rounded-full bg-accent-safe/10 flex items-center justify-center font-mono text-sm text-accent-safe border border-accent-safe/20 shadow-[0_0_15px_rgba(188,255,47,0.15)]">
                        {`N${index+1}`}
                     </div>
                     <div>
                        <div className="font-sans text-lg font-bold text-primary uppercase tracking-tight">{check.name}</div>
                        <div className="font-mono text-[10px] uppercase text-secondary/60 tracking-widest mt-1">SIGNATURE VERIFIED</div>
                     </div>
                  </div>
                  <div className={`font-mono text-[11px] tracking-widest font-bold uppercase border px-4 py-2 rounded-full ${check.passed ? 'border-accent-safe text-accent-safe bg-accent-safe/10 shadow-[0_0_10px_rgba(188,255,47,0.2)]' : 'border-accent-danger text-accent-danger bg-accent-danger/10'}`}>
                     {check.passed ? 'PASS' : 'BLOCK'}
                  </div>
               </div>

               <div className="flex items-center justify-between mt-2">
                 <div>
                    <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-3">THRESHOLD SCORE</div>
                    <div className={`font-mono text-4xl font-light tracking-tight ${check.score > 80 ? 'text-accent-safe' : check.score < 40 ? 'text-accent-danger' : 'text-accent-caution'}`}>
                      {check.score}
                    </div>
                 </div>
                 <div className="text-right max-w-[240px]">
                    <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-3">CRYPTOGRAPHIC REASON</div>
                    <div className="font-sans text-sm text-primary/90 truncate">{check.reason}</div>
                 </div>
               </div>
             </div>
          ))}
        </div>
      </section>

      {/* Historical Scans */}
      <section className="terminal-panel rounded-xl border border-border p-6 bg-bg/40 mt-16 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-6 mb-6 gap-4">
            <h2 className="font-sans text-2xl font-bold text-primary tracking-tight">SCANNED CONTRACTS</h2>
            <div className="flex flex-wrap gap-3">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`font-mono text-[11px] tracking-widest px-5 py-2 rounded-full border transition ${filter === f ? 'border-accent-safe text-accent-safe bg-accent-safe/10' : 'border-border text-secondary hover:text-primary hover:border-secondary'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-4 pt-4">
            {filteredVerdicts.length === 0 ? (
               <div className="text-center font-mono text-sm text-secondary/70 py-16 uppercase tracking-widest border border-dashed border-border/50 rounded">NO VERDICTS RECORDED</div>
            ) : null}

            {filteredVerdicts.map((v) => (
               <div key={`${v.tokenAddress}-${v.timestamp}`} className="flex flex-col sm:flex-row sm:items-center justify-between border border-transparent border-b-border/50 py-5 last:border-b-0 hover:bg-bg-elevated/80 cursor-pointer px-6 rounded-lg transition group">
                  <div className="flex items-center gap-6 mb-3 sm:mb-0">
                    <SecurityBadge level={v.level} />
                    <span className="font-mono text-sm font-bold text-primary group-hover:text-accent-safe transition">{truncateAddress(v.tokenAddress, 16, 8)}</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <span className="font-mono text-xl font-light text-primary">{v.score}</span>
                    <span className="font-mono text-[11px] text-secondary/60 w-24 text-right uppercase tracking-widest">{timeAgo(v.timestamp)}</span>
                  </div>
               </div>
            ))}
          </div>
      </section>
    </div>
  );
}
