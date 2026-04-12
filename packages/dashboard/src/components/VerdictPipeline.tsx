import { scoreTone } from '../lib/format';
import type { SecurityCheck, Verdict } from '../lib/types';

interface VerdictPipelineProps {
  verdict: Verdict;
  variant?: 'hero' | 'compact';
}

const displayNames = ['Contract Safety', 'Holder Analysis', 'Smart Money', 'Liquidity', 'Tx Simulation'];

const toneClasses = {
  safe: {
    node: 'border-accent-safe/70 bg-accent-safe/10 text-accent-safe shadow-[0_0_18px_rgba(57,229,140,0.14)]',
    line: 'bg-accent-safe/70',
    text: 'text-accent-safe',
  },
  caution: {
    node: 'border-accent-caution/70 bg-accent-caution/10 text-accent-caution shadow-[0_0_18px_rgba(255,184,77,0.12)]',
    line: 'bg-accent-caution/70',
    text: 'text-accent-caution',
  },
  danger: {
    node: 'border-accent-danger/70 bg-accent-danger/10 text-accent-danger shadow-[0_0_18px_rgba(255,95,95,0.14)]',
    line: 'bg-accent-danger/70',
    text: 'text-accent-danger',
  },
};

function normalizeChecks(checks: SecurityCheck[]): SecurityCheck[] {
  const fallback: SecurityCheck[] = displayNames.map((name) => ({
    name,
    passed: false,
    score: 50,
    reason: 'Awaiting scan data',
  }));
  return [...checks, ...fallback].slice(0, 5);
}

export function VerdictPipeline({ verdict, variant = 'compact' }: VerdictPipelineProps) {
  const checks = normalizeChecks(verdict.checks);
  const isHero = variant === 'hero';

  return (
    <div className={`${isHero ? 'p-5 md:p-7' : 'mt-4 p-4'} rounded-xl border border-border bg-bg/70`}>
      <div className="hidden grid-cols-5 gap-4 md:grid">
        {checks.map((check, index) => {
          const tone = scoreTone(check.score);
          return (
            <div key={`${check.name}-${index}`} className="relative flex flex-col items-center text-center">
              {index < checks.length - 1 ? (
                <div className={`absolute left-1/2 ${isHero ? 'top-12' : 'top-8'} h-px w-full translate-x-8 opacity-80 ${toneClasses[tone].line}`} />
              ) : null}
              <div className="relative z-10 flex flex-col items-center">
                <div className="mb-3 font-mono text-[10px] uppercase text-secondary">
                  LAYER {String(index + 1).padStart(2, '0')}
                </div>
                <div className={`${isHero ? 'h-20 w-20 text-2xl' : 'h-14 w-14 text-base'} flex items-center justify-center rounded border font-mono font-bold transition-all ${toneClasses[tone].node}`}>
                  {Math.round(check.score)}
                </div>
              </div>
              <div className={`${isHero ? 'mt-5 text-sm' : 'mt-3 text-xs'} font-sans font-bold text-primary`}>
                {displayNames[index] ?? check.name}
              </div>
              <div className={`${isHero ? 'max-w-[12rem]' : 'max-w-[9rem]'} mt-2 truncate font-sans text-xs text-secondary`}>
                {check.reason}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 md:hidden">
        {checks.map((check, index) => {
          const tone = scoreTone(check.score);
          return (
            <div key={`${check.name}-mobile-${index}`} className="relative flex gap-3">
              {index < checks.length - 1 ? (
                <div className={`absolute left-6 top-12 h-full w-0.5 opacity-70 ${toneClasses[tone].line}`} />
              ) : null}
              <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded border font-mono text-sm font-bold ${toneClasses[tone].node}`}>
                {Math.round(check.score)}
              </div>
              <div className="min-w-0 pt-1">
                <div className="font-mono text-[10px] uppercase text-secondary">
                  LAYER {String(index + 1).padStart(2, '0')}
                </div>
                <div className="mt-1 font-sans text-sm font-bold text-primary">
                  {displayNames[index] ?? check.name}
                </div>
                <div className="truncate font-sans text-xs text-secondary">
                  {check.reason}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
