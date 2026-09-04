import { NavLink } from 'react-router-dom';
import { CalendarCheck, Pill, Package, TrendingUp, Settings2 } from 'lucide-react';

// The same treatment as the finance app's BottomNav, deliberately: the two are
// siblings on one origin, and a person moving between them shouldn't have to
// re-learn where their thumb goes.
//
// The crash protocol is not a tab. It's one accent row on Today — still a
// single tap, but not a permanent fixture of every screen, which is the whole
// point of the reorganisation.
const links = [
  { to: '/', label: 'Today', Icon: CalendarCheck },
  { to: '/meds', label: 'Meds', Icon: Pill },
  { to: '/supply', label: 'Supply', Icon: Package },
  { to: '/history', label: 'History', Icon: TrendingUp },
  { to: '/setup', label: 'Settings', Icon: Settings2 },
];

export default function RxNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border)' }}
    >
      <div
        className="flex max-w-2xl mx-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
            {({ isActive }) => (
              <div className="flex flex-col items-center justify-center h-16 gap-1">
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  style={{ color: isActive ? 'var(--accent-text)' : 'var(--subtle)' }}
                />
                <span
                  className="text-[9px] font-semibold leading-none tracking-tight"
                  style={{ color: isActive ? 'var(--accent-text)' : 'var(--subtle)' }}
                >
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
