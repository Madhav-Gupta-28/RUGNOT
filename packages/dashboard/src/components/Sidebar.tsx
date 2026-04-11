import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/chat', label: 'Chat', icon: '◇' },
  { to: '/portfolio', label: 'Portfolio', icon: '▥' },
  { to: '/security', label: 'Security', icon: '⛨' },
  { to: '/economics', label: 'Economics', icon: '$' },
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border bg-bg-surface lg:block">
      <div className="flex h-14 items-center border-b border-border px-5">
        <div className="font-mono text-lg font-bold tracking-normal text-accent-safe">RUGNOT</div>
      </div>
      <nav className="space-y-1 p-3">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 font-sans text-sm transition ${
              isActive
                ? 'border-accent-safe bg-bg-elevated text-primary'
                : 'border-transparent text-secondary hover:bg-bg-elevated/50 hover:text-primary'
            }`}
          >
            <span className="w-5 text-center font-mono text-sm text-accent-safe">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
