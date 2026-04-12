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
    <div className="border border-border bg-bg/40 rounded-lg p-8 transition hover:border-accent-safe/50 hover:bg-bg/60 group">
      <div className="font-mono text-[11px] tracking-widest uppercase text-secondary mb-6 group-hover:text-accent-safe transition-colors">{label}</div>
      <div className="font-sans text-4xl lg:text-5xl font-light text-primary mb-3 tracking-tight">{value}</div>
      <div className="font-mono text-xs text-secondary/70">{caption}</div>
    </div>
  );
}

function LoopCard({ index, title, description }: Readonly<{ index: string; title: string; description: string; }>) {
  return (
    <div className="border border-border bg-bg/40 rounded-lg p-6 flex flex-col md:flex-row gap-6 transition hover:border-accent-safe/50 hover:shadow-[0_0_20px_rgba(188,255,47,0.05)]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-safe/10 font-mono text-xs text-accent-safe border border-accent-safe/30">
        {index}
      </div>
      <div>
        <div className="font-sans text-lg font-bold text-primary mb-3 flex items-center gap-3">
           {title} <span className="h-1px w-10 bg-border/50 hidden md:block" />
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
      <section className="terminal-panel rounded-xl border border-border p-8 md:p-12 mb-12 mt-4 relative overflow-hidden">
        {/* Subtle MPC nodes background aesthetic */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#bcff2f 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#0a0a0a]/80 to-[#000000] opacity-90" />
        
        <div className="relative z-10 max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded border border-accent-safe/50 bg-accent-safe/10 px-4 py-2 font-mono text-[10px] tracking-widest text-accent-safe uppercase mb-10 shadow-[0_0_15px_rgba(188,255,47,0.15)]">
            <span className="h-2 w-2 rounded-full bg-accent-safe animate-pulse-safe" />
            LIVE ON OKX X-LAYER
          </div>
          
          <h1 className="font-sans text-6xl sm:text-7xl lg:text-8xl font-bold leading-[0.9] text-primary tracking-tighter mb-6">
            RUGNOT
          </h1>
          <h2 className="font-sans text-2xl sm:text-4xl lg:text-5xl font-light text-secondary tracking-tight mb-8">
            AUTONOMOUS DEFENSE ONLINE
          </h2>
          
          <p className="max-w-3xl font-sans text-lg lg:text-xl text-secondary/80 leading-relaxed mb-12">
            Scout finds signals. Guardian blocks rugs. Sentinel exits threats. Every analysis is powered by Stitch MPC thresholds to guarantee trustless execution and cryptographic proof of security on X Layer.
          </p>
          
          <div className="flex flex-wrap gap-6">
            <a
              href="#live-feed"
              className="rounded border border-accent-safe bg-accent-safe/10 px-8 py-4 font-mono text-sm font-bold tracking-widest text-accent-safe transition hover:bg-accent-safe hover:text-bg hover:shadow-[0_0_20px_rgba(188,255,47,0.4)]"
            >
              <span className="mr-3 inline-block h-2 w-2 rounded-full bg-accent-safe" />
              WATCH LIVE FEED
            </a>
            <Link
              to="/security"
              className="rounded border border-border bg-transparent px-8 py-4 font-mono text-sm font-bold tracking-widest text-secondary transition hover:border-secondary hover:text-primary uppercase"
            >
              VERIFY EXECUTIONS
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TOTAL SCANS" value={String(state.recentVerdicts.length)} caption="Guardian verdict ledger" />
        <StatCard label="THREATS BLOCKED" value={String(dangerVerdicts)} caption="Auto-blocked or exited via MPC" />
        <StatCard label="PORTFOLIO VALUE" value={formatMoney(portfolioValue)} caption="Marked open exposure" />
        <StatCard label="X402 REVENUE" value={`$${state.x402TotalEarned.toFixed(3)}`} caption="Security checks sold globally" />
      </section>

      {/* Workflow Loop Cards (MPC Stitch Thematic) */}
      <div className="pt-8">
         <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-3">STITCH MPC ARCHITECTURE</div>
         <h3 className="font-sans text-3xl font-bold text-primary mb-8">VERIFIED THRESHOLD PIPELINE</h3>
         <section className="grid gap-6 lg:grid-cols-3 relative">
           <LoopCard 
             index="01" 
             title="Scout Aggregation" 
             description="Continuous scanning of market signals across chains to locate optimal entry points before risk accumulation." 
           />
           <LoopCard 
             index="02" 
             title="Stitch Multi-Sig Verification" 
             description="Five deep-security checks executed across MPC node thresholds. Full analysis is completely transparent." 
           />
           <LoopCard 
             index="03" 
             title="Sentinel Key-Action" 
             description="Monitoring open positions for automated threat-triggers, forcing defensive exits to eliminate portfolio loss." 
           />
         </section>
      </div>

      <div className="mt-20 mb-8 pt-8 border-t border-border/50">
        <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-3">RUGNOT SENTINEL SYSTEM</div>
        <div className="flex items-center justify-between">
          <h3 className="font-sans text-3xl font-bold text-primary">ON-CHAIN ACTIVITY STREAM</h3>
          <div className="flex items-center gap-4 text-[11px] font-mono tracking-widest">
            <span className="text-secondary/70 flex items-center gap-2"><span className="h-2 w-2 bg-secondary/50 rounded-full inline-block" /> AWAITING LOGS</span>
            <Link to="/portfolio" className="text-secondary hover:text-accent-safe transition border-b border-secondary/50 hover:border-accent-safe pb-0.5">OPEN LIVE PORTFOLIO →</Link>
          </div>
        </div>
      </div>

      <LiveFeed />
    </div>
  );
}
