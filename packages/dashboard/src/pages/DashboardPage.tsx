import { formatMoney } from '../lib/format';
import { useRugnotStore } from '../store';
import { LiveFeed } from '../components/LiveFeed';

interface StatCardProps {
  label: string;
  value: string;
  tone: 'safe' | 'caution' | 'danger' | 'info';
}

const toneClasses: Record<StatCardProps['tone'], string> = {
  safe: 'text-accent-safe',
  caution: 'text-accent-caution',
  danger: 'text-accent-danger',
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

export function DashboardPage() {
  const state = useRugnotStore((store) => store.state);
  const portfolioValue = state.positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
  const dangerVerdicts = state.recentVerdicts.filter((verdict) => verdict.level === 'DANGER').length;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-sans text-2xl font-bold text-primary">Dashboard</h1>
        <p className="mt-1 font-sans text-sm text-secondary">Scout signals, guardian scans, and defense events in one command view.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Scans" value={String(state.recentVerdicts.length)} tone="info" />
        <StatCard label="Threats Blocked" value={String(dangerVerdicts)} tone="danger" />
        <StatCard label="Portfolio Value" value={formatMoney(portfolioValue)} tone="safe" />
        <StatCard label="x402 Revenue" value={`$${state.x402TotalEarned.toFixed(3)}`} tone="caution" />
      </section>

      <LiveFeed />
    </div>
  );
}
