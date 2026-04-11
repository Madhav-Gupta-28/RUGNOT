import { scoreTone } from '../lib/format';
import type { SecurityCheck, Verdict } from '../lib/types';

interface VerdictPipelineProps {
  verdict: Verdict;
}

const displayNames = ['Contract', 'Holders', 'Smart $', 'Liquidity', 'Simulate'];

const toneClasses = {
  safe: {
    circle: 'bg-accent-safe/20 border-accent-safe text-accent-safe shadow-[0_0_18px_rgba(0,255,136,0.18)]',
    line: 'bg-accent-safe',
  },
  caution: {
    circle: 'bg-accent-caution/20 border-accent-caution text-accent-caution shadow-[0_0_18px_rgba(255,149,0,0.14)]',
    line: 'bg-accent-caution',
  },
  danger: {
    circle: 'bg-accent-danger/20 border-accent-danger text-accent-danger shadow-[0_0_18px_rgba(255,59,59,0.18)]',
    line: 'bg-accent-danger',
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

export function VerdictPipeline({ verdict }: VerdictPipelineProps) {
  const checks = normalizeChecks(verdict.checks);

  return (
    <div className="mt-4 rounded-xl border border-border bg-bg/60 p-4">
      <div className="hidden grid-cols-5 gap-3 md:grid">
        {checks.map((check, index) => {
          const tone = scoreTone(check.score);
          return (
            <div key={`${check.name}-${index}`} className="relative flex flex-col items-center text-center">
              {index < checks.length - 1 ? (
                <div className={`absolute left-1/2 top-6 h-0.5 w-full translate-x-6 opacity-70 ${toneClasses[tone].line}`} />
              ) : null}
              <div className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border font-mono text-sm font-bold transition-all ${toneClasses[tone].circle}`}>
                {Math.round(check.score)}
              </div>
              <div className="mt-3 font-sans text-xs font-medium text-primary">
                {displayNames[index] ?? check.name}
              </div>
              <div className="mt-1 max-w-[9rem] truncate font-sans text-xs text-secondary">
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
              <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold ${toneClasses[tone].circle}`}>
                {Math.round(check.score)}
              </div>
              <div className="min-w-0 pt-1">
                <div className="font-sans text-sm font-medium text-primary">
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
