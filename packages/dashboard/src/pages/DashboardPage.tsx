import { Link } from 'react-router-dom';

import { formatMoney } from '../lib/format';
import { useRugnotStore } from '../store';
import { LiveFeed } from '../components/LiveFeed';

interface StatCardProps {
  label: string;
  value: string;
  caption: string;
}

function StatCard({ label, value, caption }: StatCardProps) {
  return (
    <div className="terminal-panel rounded-md p-6 transition hover:border-accent-safe/50 hover:bg-bg-surface group">
      <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-4 group-hover:text-accent-safe transition-colors">{label}</div>
      <div className="font-sans text-4xl font-semibold text-primary mb-2 tracking-tight">{value}</div>
      <div className="font-mono text-[11px] text-secondary/70">{caption}</div>
    </div>
  );
}

function LoopCard({ index, title, description }: Readonly<{ index: string; title: string; description: string; }>) {
  return (
    <div className="terminal-panel rounded-md p-6 flex flex-col md:flex-row gap-5 transition hover:border-accent-safe/50 hover:shadow-[0_0_20px_rgba(188,255,47,0.05)]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent-safe/10 font-mono text-xs text-accent-safe border border-accent-safe/30">
        {index}
      </div>
      <div>
        <div className="font-sans text-lg font-bold text-primary mb-2 flex items-center gap-3">
           {title} <span className="hidden h-px w-8 bg-border md:block" />
        </div>
        <p className="font-sans text-sm text-secondary leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const state = useRugnotStore((store) => store.state);
  const portfolioValue = state.positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
  const dangerVerdicts = state.recentVerdicts.filter((verdict) => verdict.level === 'DANGER').length;
  
  return (
    <div className="mx-auto max-w-7xl space-y-12">
      {/* Hero Section */}
      {/* Hero Section */}
      <section className="terminal-panel rounded-md p-10 md:p-14 mb-16 mt-4 relative animate-slide-in hover:border-accent-safe/40 transition-colors duration-500">
        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded border border-accent-safe/30 bg-accent-safe/10 px-3 py-1.5 font-mono text-[9px] font-bold tracking-widest text-accent-safe uppercase mb-8 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-safe animate-pulse-safe" />
            LIVE ON OKX X-LAYER
          </div>
          
          <h1 className="font-sans text-6xl sm:text-7xl lg:text-[6rem] font-bold leading-[0.9] text-primary tracking-tighter mb-4">
            RUGNOT
          </h1>
          <h2 className="font-sans text-xl sm:text-2xl lg:text-3xl font-bold text-primary uppercase tracking-tight mb-8">
            AUTONOMOUS DEFENSE ONLINE
          </h2>
          
          <p className="max-w-2xl font-sans text-sm text-secondary leading-relaxed mb-12">
            Scout finds live OKX market signals. Guardian blocks rugs with five independent risk checks. Sentinel watches open positions and exits threats before they can drain the wallet.
          </p>
          
          <div className="flex flex-wrap gap-4 mt-8">
            <a
              href="#live-feed"
              className="rounded border border-accent-safe/30 bg-accent-safe/5 px-6 py-2.5 font-mono text-[11px] font-bold tracking-widest text-accent-safe transition-colors hover:bg-accent-safe/20 hover:border-accent-safe/60 flex items-center group"
            >
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-accent-safe" />
              WATCH LIVE FEED
            </a>
            <Link
              to="/security"
              className="rounded border border-[#333333] bg-transparent px-6 py-2.5 font-mono text-[11px] font-bold tracking-widest text-secondary transition-colors hover:border-secondary hover:text-primary uppercase"
            >
              VERIFY EXECUTIONS
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TOTAL SCANS" value={String(state.recentVerdicts.length)} caption="Guardian verdict ledger" />
        <StatCard label="THREATS BLOCKED" value={String(dangerVerdicts)} caption="Blocked by Guardian or Sentinel" />
        <StatCard label="PORTFOLIO VALUE" value={formatMoney(portfolioValue)} caption="Marked open exposure" />
        <StatCard label="X402 REVENUE" value={`$${state.x402TotalEarned.toFixed(3)}`} caption="Security checks sold globally" />
      </section>


      {/* Workflow Loop Cards */}
      <div className="pt-8">
         <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-3">RUGNOT AGENT ARCHITECTURE</div>
         <h3 className="font-sans text-2xl font-bold text-primary mb-6">GUARDIAN EXECUTION PIPELINE</h3>
         <section className="grid gap-6 lg:grid-cols-3 relative">
           <LoopCard 
             index="01" 
             title="Scout Aggregation" 
             description="Continuous scanning of market signals across chains to locate optimal entry points before risk accumulation." 
           />
           <LoopCard 
             index="02" 
             title="Guardian Verification" 
             description="Five security checks score contract safety, holders, smart money, liquidity, and swap simulation before any execution." 
           />
           <LoopCard 
             index="03" 
             title="Sentinel Auto-Exit" 
             description="Monitoring open positions for automated threat-triggers, forcing defensive exits to eliminate portfolio loss." 
           />
         </section>
      </div>

      <div className="mt-16 mb-6 pt-6 border-t border-[#1a1a1a]">
        <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">RUGNOT SENTINEL SYSTEM</div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-sans text-2xl font-bold text-primary">ON-CHAIN ACTIVITY STREAM</h3>
          <div className="flex items-center gap-3 text-[10px] font-mono tracking-widest uppercase">
            <span className="text-secondary/70 flex items-center gap-2"><span className="h-1.5 w-1.5 bg-secondary/50 rounded-full inline-block" /> AWAITING LOGS</span>
            <Link to="/portfolio" className="text-secondary hover:text-accent-safe transition border-b border-border hover:border-accent-safe pb-0.5">OPEN LIVE PORTFOLIO →</Link>
          </div>
        </div>
      </div>

      <LiveFeed />
    </div>
  );
}
