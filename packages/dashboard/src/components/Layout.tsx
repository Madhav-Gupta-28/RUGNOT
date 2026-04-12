import { Link, NavLink, Outlet } from 'react-router-dom';

import { truncateAddress } from '../lib/format';
import { useRugnotStore } from '../store';

const links = [
  { to: '/portfolio', label: 'PORTFOLIO' },
  { to: '/security', label: 'SECURITY' },
  { to: '/economics', label: 'ECONOMICS' },
  { to: '/chat', label: 'CHAT' },
];

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
      <header className="sticky top-0 z-50 flex h-16 sm:h-20 items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur md:px-8 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-mono text-xl sm:text-2xl font-bold text-primary flex items-center gap-2 hover:text-accent-safe transition">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 22H22L12 2Z" stroke="#bcff2f" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
            RUGNOT
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `font-mono text-[11px] sm:text-xs tracking-wider transition ${
                isActive
                  ? 'text-primary font-bold border-b-2 border-accent-safe pb-1'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
            <span className="font-mono text-xs text-secondary">
              {state.walletBalance.toFixed(2)} USDT
            </span>
          </div>
          <button className="rounded border border-border bg-bg px-4 py-2 font-mono text-xs text-primary transition hover:border-accent-safe hover:text-accent-safe">
            {state.walletAddress ? truncateAddress(state.walletAddress) : 'CONNECT WALLET'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8 xl:px-12 w-full mx-auto max-w-[120rem]">
        <Outlet />
      </main>
    </div>
  );
}
