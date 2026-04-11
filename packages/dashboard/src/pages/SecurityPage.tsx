import { useMemo, useState } from 'react';

import { SecurityBadge } from '../components/SecurityBadge';
import { VerdictPipeline } from '../components/VerdictPipeline';
import { timeAgo, truncateAddress } from '../lib/format';
import type { VerdictLevel } from '../lib/types';
import { useRugnotStore } from '../store';

type Filter = 'ALL' | VerdictLevel;

const filters: Filter[] = ['ALL', 'GO', 'CAUTION', 'DANGER'];

export function SecurityPage() {
  const verdicts = useRugnotStore((store) => store.state.recentVerdicts);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filteredVerdicts = useMemo(() => {
    if (filter === 'ALL') {
      return verdicts;
    }
    return verdicts.filter((verdict) => verdict.level === filter);
  }, [filter, verdicts]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-sans text-2xl font-bold text-primary">Security</h1>
        <p className="mt-1 font-sans text-sm text-secondary">Every scan passes through the five-layer guardian pipeline.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs font-bold transition ${
              filter === item
                ? 'border-accent-safe bg-accent-safe/15 text-accent-safe'
                : 'border-border bg-bg-surface text-secondary hover:bg-bg-elevated hover:text-primary'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredVerdicts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
          <p className="font-sans text-sm text-secondary">No verdicts in this filter yet. Guardian output will appear here as scans complete.</p>
        </div>
      ) : (
        <div>
          {filteredVerdicts.map((verdict) => {
            const key = `${verdict.tokenAddress}-${verdict.timestamp}`;
            const isExpanded = expanded === key;
            return (
              <article
                key={key}
                onClick={() => setExpanded(isExpanded ? null : key)}
                className="mb-3 cursor-pointer rounded-xl border border-border bg-bg-surface p-4 transition hover:border-accent-safe/30"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <SecurityBadge level={verdict.level} />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-primary">
                    {truncateAddress(verdict.tokenAddress, 10, 6)}
                  </span>
                  <span className="font-mono text-2xl font-bold text-primary">{verdict.score}</span>
                  <time className="font-mono text-xs text-secondary">{timeAgo(verdict.timestamp)}</time>
                </div>
                {isExpanded ? <VerdictPipeline verdict={verdict} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
