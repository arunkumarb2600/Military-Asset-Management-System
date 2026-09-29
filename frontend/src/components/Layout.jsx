import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV = [
  { section: 'Operations' },
  { to: '/',          label: 'Dashboard',              icon: '▦', end: true },
  { to: '/opening-balances', label: 'Opening Stock',    icon: '▣' },
  { to: '/purchases', label: 'Purchases',              icon: '＋' },
  { to: '/transfers', label: 'Transfers',              icon: '⇄' },
  { to: '/assignments', label: 'Assignments & Expenditures', icon: '👤' },
  { section: 'Administration' },
  { to: '/users',     label: 'User Management',        icon: '⚙', adminOnly: true },
  { to: '/audit',     label: 'API Audit Log',          icon: '☰' }
];

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const initials = (user?.name || '?')
    .split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="app">
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">MAMS</div>
          <div className="brand-name">Asset Management</div>
          <div className="brand-sub">Military logistics &amp; accountability</div>
        </div>

        <nav className="nav">
          {NAV.map((item, i) =>
            item.section ? (
              <div className="nav-label" key={`s${i}`}>{item.section}</div>
            ) : (
              !item.adminOnly || isAdmin ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <span className="ico" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </NavLink>
              ) : null
            )
          )}
        </nav>

        <div className="user-chip">
          <div className="n">{user?.name}</div>
          <div className="r">
            {user?.role}
            {user?.base ? ` · ${user.base}` : ' · all bases'}
          </div>
        </div>
        <div className="sidebar-foot">
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
          <div>
            <div className="row tight">
              <span
                className="badge role"
                style={{ background: 'var(--primary)', color: '#fff' }}
                title={user?.role}
              >
                {initials}
              </span>
              <strong className="nowrap">{user?.name}</strong>
              <span className="muted small nowrap">
                {user?.role === 'admin' ? 'Administrator' : `${user?.role} · ${user?.base}`}
              </span>
            </div>
            <div className="sub">{today}</div>
          </div>

          <div className="topbar-right">
            {!isAdmin && (
              <span className="badge info">Scoped to {user?.base}</span>
            )}
            <button className="btn btn-sm" onClick={logout}>Sign out</button>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
