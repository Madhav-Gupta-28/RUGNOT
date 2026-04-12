import { Link, NavLink, Outlet } from 'react-router-dom';

import { truncateAddress } from '../lib/format';
import { useRugnotStore } from '../store';

const links = [
  { to: '/portfolio', label: 'portfolio' },
  { to: '/security', label: 'security' },
  { to: '/economics', label: 'economics' },
  { to: '/system', label: 'system' },
  { to: '/chat', label: 'chat' },
];

function Footer() {
  return (
    <footer className="mt-8 shrink-0 border-t border-border bg-bg px-6 py-6 font-mono text-[10px] uppercase tracking-widest text-secondary flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="text-secondary/50">
        RUGNOT AUTONOMOUS DEFENSE · X-402 INTEGRATED
      </div>
      <div className="flex items-center gap-6">
        <a href="https://www.okx.com/web3/explorer/xlayer" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">X-LAYER RPC</a>
        <a href="https://github.com/Madhav-Gupta-28/RUGNOT" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">GITHUB REPOSITORY</a>
        <span className="text-accent-safe/60 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent-safe/60" /> SECURE</span>
      </div>
    </footer>
  );
}

export function Layout() {
  const state = useRugnotStore((store) => store.state);
  // Status indicator
  const statusTone = state.isPaused
    ? 'bg-accent-caution'
    : state.isRunning
      ? 'animate-pulse bg-accent-safe'
      : 'bg-secondary';

  return (
    <div className="min-h-screen bg-bg text-primary flex flex-col">
      <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-mono text-lg font-bold text-primary flex items-center gap-2 hover:text-accent-safe transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 22H22L12 2Z" stroke="#bcff2f" strokeWidth="2.5" strokeLinejoin="round"/>
            </svg>
            RUGNOT
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `font-mono text-[11px] font-bold uppercase tracking-widest transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2.5 bg-bg-surface px-3 py-1 border border-border">
            <span className={`h-2 w-2 rounded-full ${statusTone}`} />
            <span className="font-mono text-[10px] uppercase text-secondary tracking-widest">
              {state.walletBalance.toFixed(2)} USDT
            </span>
          </div>
          <button className="border border-border bg-transparent px-4 py-2 font-mono text-[10px] font-bold tracking-widest uppercase text-secondary transition hover:border-accent-safe hover:text-accent-safe">
            {state.walletAddress ? truncateAddress(state.walletAddress) : 'CONNECT WALLET'}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 md:px-8 w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
