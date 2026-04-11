import { Outlet } from 'react-router-dom';

import { truncateAddress } from '../lib/format';
import { useRugnotStore } from '../store';
import { Sidebar } from './Sidebar';

export function Layout() {
  const state = useRugnotStore((store) => store.state);
  const error = useRugnotStore((store) => store.error);

  return (
    <div className="min-h-screen bg-bg terminal-grid">
      <Sidebar />
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-bg-surface/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="font-mono text-lg font-bold text-accent-safe">RUGNOT</div>
          </div>
          <div className="hidden font-sans text-sm text-secondary lg:block">
            The only DeFi agent that will not get you rugged.
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${state.isRunning ? 'animate-pulse bg-accent-safe' : 'bg-secondary'}`} />
              <span className="hidden font-sans text-xs text-secondary sm:inline">
                {state.isRunning ? 'running' : 'stopped'}
              </span>
            </div>
            <div className="hidden font-mono text-xs text-secondary md:block">
              {truncateAddress(state.walletAddress)}
            </div>
            <div className="rounded-full border border-border bg-bg px-3 py-1 font-mono text-xs text-primary">
              {state.walletBalance.toFixed(2)} USDT
            </div>
          </div>
        </header>

        {error ? (
          <div className="border-b border-accent-caution/30 bg-accent-caution/10 px-6 py-2 font-sans text-sm text-accent-caution">
            Backend offline or unreachable. Showing cached and demo-ready empty states.
          </div>
        ) : null}

        <main className="h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
