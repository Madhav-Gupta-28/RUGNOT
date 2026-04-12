import { useRugnotStore } from '../store';
import { AgentOpsPanels } from '../components/AgentOpsPanels';

export function SystemPage() {
  const state = useRugnotStore((store) => store.state);

  return (
    <div className="mx-auto max-w-7xl animate-slide-in mt-4">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#1a1a1a] pb-6">
        <div>
           <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">CORE ARCHITECTURE</div>
           <h1 className="font-sans text-3xl font-bold text-primary tracking-tight">System Telemetry</h1>
        </div>
        <div className="flex gap-8 sm:gap-12 text-left md:text-right">
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">AGENT STATE</div>
             <div className="font-mono text-2xl text-accent-safe uppercase tracking-widest text-[16px] flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent-safe animate-pulse-safe" /> ONLINE</div>
           </div>
           <div>
             <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">API LATENCY</div>
             <div className="font-mono text-2xl text-primary tracking-widest text-[16px]">24ms</div>
           </div>
        </div>
      </div>
      
      <AgentOpsPanels state={state} />
    </div>
  );
}
