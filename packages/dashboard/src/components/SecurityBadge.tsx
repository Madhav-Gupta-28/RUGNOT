import type { VerdictLevel } from '../lib/types';

interface SecurityBadgeProps {
  level: VerdictLevel;
}

const badgeClasses: Record<VerdictLevel, string> = {
  GO: 'bg-accent-safe/15 text-accent-safe border-accent-safe/30 animate-pulse-safe',
  CAUTION: 'bg-accent-caution/15 text-accent-caution border-accent-caution/30',
  DANGER: 'bg-accent-danger/15 text-accent-danger border-accent-danger/30 animate-shake-danger',
};

export function SecurityBadge({ level }: SecurityBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs font-bold uppercase ${badgeClasses[level]}`}>
      {level}
    </span>
  );
}
