import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { full, get, patch, post, put, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, Pager, StatusBadge, fmtDateTime, useDebounced, useToast } from '../ui';

// ---------------- Audit log (read only) ----------------
export function Audit() {
  const [module, setModule] = useState(''); const [user, setUser] = useState(''); const [page, setPage] = useState(1);
  const du = useDebounced(user);
  useEffect(() => setPage(1), [module, du]);
  const q = useQuery({ queryKey: ['audit', module, du, page], queryFn: () => full(`/audit-logs${qs({ module, user: du, page, limit: 20 })}`), placeholderData: (p) => p });
  const mods = ['auth', 'bookings', 'estimates', 'enquiries', 'pilots', 'clients', 'availability', 'certificates', 'enrollment', 'batches', 'fleet', 'documents', 'users', 'settings'];
  return (
    <>
      <PageHead title="Audit log" sub="Every important action, who did it and when. Read only." />
      <div className="toolbar">
        <select value={module} onChange={(e) => setModule(e.target.value)}><option value="">All modules</option>{mods.map((m) => <option key={m}>{m}</option>)}</select>
        <input placeholder="Filter by user" value={user} onChange={(e) => setUser(e.target.value)} />
      </div>
      <div className="card">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (q.data?.data || []).length === 0 ? <Empty title="No entries" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Module</th><th>Reference</th></tr></thead>
            <tbody>{q.data.data.map((a) => <tr key={a._id}><td className="nowrap">{fmtDateTime(a.timestamp)}</td><td>{a.userName}</td><td>{a.action}</td><td><Badge tone="gray">{a.module}</Badge></td><td className="mono">{a.entityId}</td></tr>)}</tbody></table></div>
        )}
        <Pager page={page} limit={20} total={q.data?.total || 0} onPage={setPage} />
      </div>
    </>
  );
}

// ---------------- Settings ----------------
function Users() {
  const toast = useToast(); const qc = useQueryClient(); const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', role: 'office', password: '' });
  const q = useQuery({ queryKey: ['users'], queryFn: () => get('/users') });
  const toggle = useMutation({ mutationFn: ({ id, isActive }) => patch(`/users/${id}/status`, { isActive }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('User updated', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const add = useMutation({ mutationFn: () => post('/users', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('User created', 'ok'); setAdding(false); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Card title="Users" action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add user</button>} pad={false}>
      {q.isLoading ? <Loading /> : (
        <table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Active</th></tr></thead>
          <tbody>{q.data.map((u) => <tr key={u._id}><td><b>{u.name}</b></td><td>{u.email}</td><td><StatusBadge s={u.role} /></td><td className="muted">{u.lastLogin ? fmtDateTime(u.lastLogin) : 'Never'}</td><td><input type="checkbox" style={{ width: 'auto' }} checked={u.isActive} onChange={(e) => toggle.mutate({ id: u._id, isActive: e.target.checked })} /></td></tr>)}</tbody></table>
      )}
      {adding && (
        <Modal title="Add user" onClose={() => setAdding(false)} footer={<><button className="btn btn-outline" onClick={() => setAdding(false)}>Close</button><button className="btn btn-primary" disabled={add.isPending || !f.name || !f.email || f.password.length < 6} onClick={() => add.mutate()}>Create</button></>}>
          <div className="frow"><Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="office">Office</option><option value="admin">Admin</option></select></Field></div>
          <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Temporary password (min 6)"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </Modal>
      )}
    </Card>
  );
}

function Rates() {
  const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rates'], queryFn: () => get('/settings/rate-library') });
  const [r, setR] = useState(null);
  useEffect(() => { if (q.data && !r) setR(q.data); }, [q.data]);
  const save = useMutation({ mutationFn: () => put('/settings/rate-library', r), onSuccess: () => { qc.invalidateQueries({ queryKey: ['rates'] }); toast('Rates saved. New estimates use them.', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  if (!r) return <Loading />;
  const group = (key, title) => (
    <Card title={title} style={{ marginBottom: 16 }}>
      <div className="frow3">{Object.keys(r[key]).map((k) => <Field key={k} label={`${k} (₹ / day)`}><input type="number" value={r[key][k]} onChange={(e) => setR({ ...r, [key]: { ...r[key], [k]: Number(e.target.value) } })} /></Field>)}</div>
    </Card>
  );
  const n = (k, label) => <Field label={label}><input type="number" value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} /></Field>;
  return (
    <>
      {group('pilotRates', 'Pilot day rates')}{group('droneRates', 'Drone day rates')}
      <Card title="Other rates and percentages" style={{ marginBottom: 16 }}>
        <div className="frow3">{n('ratePerKm', 'Travel rate per km (₹)')}{n('food', 'Food per person / day (₹)')}{n('hotel', 'Hotel per night (₹)')}{n('reportRate', 'Report rate per hour (₹)')}{n('overheadPct', 'Overhead %')}{n('contingencyPct', 'Contingency %')}{n('marginPct', 'Margin %')}{n('taxPct', 'GST %')}</div>
      </Card>
      <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save rates</button>
    </>
  );
}

function Site() {
  const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['site-settings'], queryFn: () => get('/settings/website') });
  const save = useMutation({ mutationFn: (v) => put('/settings/website', { showPilotNames: v }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['site-settings'] }); toast('Website setting saved', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Card title="Website booking">
      <label className="row" style={{ cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!q.data?.showPilotNames} onChange={(e) => save.mutate(e.target.checked)} />
        <span><b>Show pilot names on the website</b><div className="muted small">Off by default. Clients then only see anonymous pilot codes, level and city.</div></span>
      </label>
    </Card>
  );
}

function Demo() {
  const toast = useToast(); const { logout } = useAuth();
  const reset = useMutation({ mutationFn: () => post('/settings/reset-demo'), onSuccess: async () => { toast('Demo data restored. Please sign in again.', 'ok'); await logout(false); window.location.href = '/'; }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Card title="Demo data">
      <p className="muted" style={{ marginTop: 0 }}>Wipes everything and restores the starting demo data (about 20 seconds). Use it before each presentation.</p>
      <button className="btn btn-danger" disabled={reset.isPending} onClick={() => window.confirm('Reset all demo data? Changes made so far will be lost.') && reset.mutate()}>{reset.isPending ? 'Resetting…' : 'Reset demo data'}</button>
    </Card>
  );
}

export function Settings() {
  const [tab, setTab] = useState('users');
  const tabs = [['users', 'Users'], ['rates', 'Rate library'], ['site', 'Website'], ['demo', 'Demo']];
  return (
    <>
      <PageHead title="Settings" sub="Users, rates and website options." />
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'users' && <Users />}{tab === 'rates' && <Rates />}{tab === 'site' && <Site />}{tab === 'demo' && <Demo />}
    </>
  );
}
