import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { full, post } from './api';
import { useAuth } from './auth';
import { Icon, ago } from './ui';

export const NAV = [
  { g: 'Operations', items: [
    { to: '/', label: 'Dashboard', icon: 'dash', roles: ['admin', 'office', 'pilot'], end: true },
    { to: '/bookings', label: 'Bookings', icon: 'book', roles: ['admin', 'office', 'pilot'] },
    { to: '/availability', label: 'Availability', icon: 'cal', roles: ['admin', 'office', 'pilot'] },
    { to: '/pilots', label: 'Pilots', icon: 'pilot', roles: ['admin', 'office'] },
    { to: '/fleet', label: 'Fleet', icon: 'drone', roles: ['admin', 'office', 'pilot'] },
  ] },
  { g: 'Sales', items: [
    { to: '/clients', label: 'Clients', icon: 'users', roles: ['admin', 'office'] },
    { to: '/enquiries', label: 'Enquiries', icon: 'mail', roles: ['admin', 'office'] },
    { to: '/estimates', label: 'Estimates', icon: 'calc', roles: ['admin', 'office'] },
  ] },
  { g: 'Training', items: [
    { to: '/students', label: 'Enrollment', icon: 'cap', roles: ['admin', 'office'] },
    { to: '/batches', label: 'Batches', icon: 'batch', roles: ['admin', 'office'] },
    { to: '/certificates', label: 'Certificates', icon: 'cert', roles: ['admin', 'office'] },
  ] },
  { g: 'Admin', items: [
    { to: '/documents', label: 'Documents', icon: 'doc', roles: ['admin', 'office', 'pilot'] },
    { to: '/audit', label: 'Audit log', icon: 'log', roles: ['admin'] },
    { to: '/settings', label: 'Settings', icon: 'gear', roles: ['admin'] },
  ] },
];

function Bell() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => full('/notifications'), refetchInterval: 60000 });
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.unread || 0;
  return (
    <div style={{ position: 'relative' }}>
      <button className="bell" onClick={() => setOpen(!open)} aria-label="Notifications"><Icon n="bell" size={20} />{unread > 0 && <b>{unread}</b>}</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setOpen(false)} />
          <div className="menu">
            <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <b>Notifications</b>{unread > 0 && <button className="btn btn-outline btn-sm" onClick={() => readAll.mutate()}>Mark all read</button>}
            </div>
            {(q.data?.data || []).length === 0 && <div className="empty">You are all caught up.</div>}
            {(q.data?.data || []).map((n) => (
              <div key={n._id} className={`it ${n.read ? '' : 'unread'}`} onClick={() => { setOpen(false); n.link && nav(n.link); }}>
                {n.title}<div className="muted small">{ago(n.createdAt)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, connected } = useAuth();
  const nav = useNavigate();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/logo.png" alt="Quantum Tech FPV" /><div>Quantum FPV<small>Operations</small></div></div>
        <nav className="nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => i.roles.includes(user.role));
            if (!items.length) return null;
            return (
              <div key={g.g}>
                <div className="grp">{g.g}</div>
                {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end}><Icon n={i.icon} /><span>{i.label}</span></NavLink>)}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="top">
          <span className={connected ? 'live' : 'badge b-gray'}>{connected ? <><i />Live updates on</> : 'Reconnecting…'}</span>
          <div className="row" style={{ gap: 14 }}>
            {user.role !== 'pilot' && <Bell />}
            <div className="user">
              <div className="avatar">{user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
              <div style={{ lineHeight: 1.25 }}><b>{user.name}</b><div className="muted small" style={{ textTransform: 'capitalize' }}>{user.role}</div></div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={async () => { await logout(); nav('/login'); }}><Icon n="out" size={15} />Log out</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
