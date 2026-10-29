import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { full, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Drawer, Empty, ErrorBox, Field, Kpi, LevelBadge, Loading, Modal, PageHead, StageBadge, StatusBadge, ago, fmtDate, useDebounced, useToast } from '../ui';

// ---------------- Pilots ----------------
function PilotDrawer({ id, onClose }) {
  const q = useQuery({ queryKey: ['pilots', id], queryFn: () => get(`/pilots/${id}`) });
  const d = q.data;
  return (
    <Drawer title={d ? d.pilot.code : 'Pilot'} onClose={onClose}>
      {!d ? <Loading /> : (
        <>
          <div className="row between mb"><h2>{d.pilot.name}</h2><StatusBadge s={d.pilot.status} /></div>
          <div className="kv mb">
            <div><small>Level</small><LevelBadge level={d.pilot.level} /></div><div><small>Base city</small><b>{d.pilot.baseCity}</b></div>
            <div><small>Phone</small><b>{d.pilot.phone}</b></div><div><small>Flight hours</small><b>{d.pilot.flightHours}</b></div>
            <div><small>Certificate no.</small><b className="mono">{d.certificate?.certNo || '–'}</b></div><div><small>Valid till</small><b>{fmtDate(d.certificate?.expiryDate)}</b></div>
          </div>
          <div className="mb"><small className="muted">Skills</small><div className="row wrap gap-sm" style={{ marginTop: 4 }}>{(d.pilot.skills || []).map((s) => <Badge key={s} tone="gray">{s}</Badge>)}</div></div>
          <h3 className="mb">Recent flights</h3>
          {d.bookings.length === 0 ? <p className="muted">No flights yet.</p> : d.bookings.slice(0, 8).map((b) => (
            <div key={b._id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><span><span className="mono">{b.bookingId}</span> <span className="muted small">{fmtDate(b.date)}</span></span><StageBadge stage={b.stage} /></div>
          ))}
        </>
      )}
    </Drawer>
  );
}

function AddPilot({ onClose }) {
  const qc = useQueryClient(); const toast = useToast();
  const levels = useQuery({ queryKey: ['masters', 'pilotLevel'], queryFn: () => get('/masters/pilotLevel') });
  const cities = useQuery({ queryKey: ['masters', 'city'], queryFn: () => get('/masters/city') });
  const [f, setF] = useState({ name: '', phone: '', email: '', level: 'Level 1', baseCity: 'Pune' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({ mutationFn: () => post('/pilots', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['pilots'] }); toast('Pilot added. Login password is Pilot@123.', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Add pilot" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={m.isPending || !f.name || !f.email || f.phone.length < 10} onClick={() => m.mutate()}>Add pilot</button></>}>
      <div className="frow"><Field label="Name"><input value={f.name} onChange={set('name')} /></Field><Field label="Mobile"><input value={f.phone} onChange={set('phone')} /></Field></div>
      <Field label="Email (also the login)"><input type="email" value={f.email} onChange={set('email')} /></Field>
      <div className="frow">
        <Field label="Level"><select value={f.level} onChange={set('level')}>{(levels.data || []).map((l) => <option key={l._id}>{l.name}</option>)}</select></Field>
        <Field label="Base city"><select value={f.baseCity} onChange={set('baseCity')}>{(cities.data || []).map((l) => <option key={l._id}>{l.name}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

export function Pilots() {
  const { user } = useAuth();
  const [open, setOpen] = useState(null); const [adding, setAdding] = useState(false); const [level, setLevel] = useState('all');
  const q = useQuery({ queryKey: ['pilots'], queryFn: () => get('/pilots') });
  const st = useQuery({ queryKey: ['pilots', 'stats'], queryFn: () => get('/pilots/stats') });
  const rows = (q.data || []).filter((p) => level === 'all' || p.level === level);
  const soon = Date.now() + 30 * 864e5;
  return (
    <>
      <PageHead title="Pilots" sub="Certified pilots, levels and flight hours.">{user.role === 'admin' && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add pilot</button>}</PageHead>
      <div className="grid g3 mb">
        {(st.data?.byLevel || []).sort((a, b) => a.level.localeCompare(b.level)).map((l) => <Kpi key={l.level} label={l.level} value={l.n} sub="pilots" />)}
      </div>
      <div className="toolbar"><select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All levels</option>{[...new Set((q.data || []).map((p) => p.level))].sort().map((l) => <option key={l}>{l}</option>)}</select></div>
      <div className="card">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Level</th><th>City</th><th>Hours</th><th>Certificate</th><th>Status</th></tr></thead>
            <tbody>{rows.map((p) => {
              const exp = p.certExpiry && new Date(p.certExpiry);
              return (
                <tr key={p._id} className="click" onClick={() => setOpen(p._id)}>
                  <td className="mono">{p.code}</td><td>{p.name}</td><td><LevelBadge level={p.level} /></td><td>{p.baseCity}</td><td>{p.flightHours}</td>
                  <td>{exp ? <Badge tone={exp < Date.now() ? 'bad' : exp < soon ? 'warn' : 'ok'}>{exp < Date.now() ? 'Expired' : exp < soon ? 'Expiring ' : 'Valid till '}{fmtDate(exp)}</Badge> : <Badge tone="bad">None</Badge>}</td>
                  <td><StatusBadge s={p.status} /></td>
                </tr>
              );
            })}</tbody></table></div>
        )}
      </div>
      {open && <PilotDrawer id={open} onClose={() => setOpen(null)} />}
      {adding && <AddPilot onClose={() => setAdding(false)} />}
    </>
  );
}

// ---------------- Clients ----------------
function ClientDrawer({ id, onClose }) {
  const q = useQuery({ queryKey: ['clients', id], queryFn: () => get(`/clients/${id}`) });
  const d = q.data;
  return (
    <Drawer title={d?.client.company || d?.client.contactName || 'Client'} onClose={onClose}>
      {!d ? <Loading /> : (
        <>
          <div className="kv mb">
            <div><small>Contact</small><b>{d.client.contactName}</b></div><div><small>Bookings</small><b>{d.client.bookingCount}</b></div>
            <div><small>Phone</small><b>{d.client.phone}</b></div><div><small>Email</small><b style={{ wordBreak: 'break-all' }}>{d.client.email}</b></div>
          </div>
          <h3 className="mb">Booking history</h3>
          {d.bookings.map((b) => (
            <div key={b._id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span><span className="mono">{b.bookingId}</span><div className="muted small">{fmtDate(b.date)} · {b.projectType} · {b.pilotId?.code}</div></span><StageBadge stage={b.stage} />
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
}

export function Clients() {
  const [s, setS] = useState(''); const [open, setOpen] = useState(null);
  const dq = useDebounced(s);
  const q = useQuery({ queryKey: ['clients', 'list', dq], queryFn: () => get(`/clients${dq ? `?q=${encodeURIComponent(dq)}` : ''}`) });
  const st = useQuery({ queryKey: ['clients', 'stats'], queryFn: () => get('/clients/stats') });
  return (
    <>
      <PageHead title="Clients" sub="Created automatically from every booking." />
      <div className="grid g4 mb">
        <Kpi label="Total clients" value={st.data?.total ?? '–'} /><Kpi label="New this month" value={st.data?.newThisMonth ?? '–'} />
        <Kpi label="Repeat clients" value={st.data?.repeat ?? '–'} sub={`${st.data?.repeatPct ?? 0}% of all clients`} /><Kpi label="One-time clients" value={st.data?.newClients ?? '–'} />
      </div>
      <Card title="New clients per month" style={{ marginBottom: 16 }}>
        <div style={{ height: 170 }}><ResponsiveContainer><BarChart data={(st.data?.monthly || []).slice(-12)} margin={{ left: -22 }}><CartesianGrid vertical={false} stroke="#EEF2F6" /><XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} /><Tooltip cursor={{ fill: '#F8FAFC' }} /><Bar dataKey="n" name="New clients" fill="#0E7490" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </Card>
      <div className="toolbar"><input placeholder="Search company or contact" value={s} onChange={(e) => setS(e.target.value)} style={{ minWidth: 260 }} /></div>
      <div className="card">
        {q.isLoading ? <Loading /> : (q.data || []).length === 0 ? <Empty title="No clients found" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Bookings</th></tr></thead>
            <tbody>{q.data.map((c) => <tr key={c._id} className="click" onClick={() => setOpen(c._id)}><td><b>{c.company || '–'}</b></td><td>{c.contactName}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.bookingCount > 1 ? <Badge tone="teal">{c.bookingCount} · repeat</Badge> : c.bookingCount}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {open && <ClientDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---------------- Enquiries ----------------
const ENQ = [['', 'All'], ['new', 'New'], ['in_discussion', 'In discussion'], ['converted', 'Converted'], ['closed', 'Closed']];
export function Enquiries() {
  const qc = useQueryClient(); const toast = useToast(); const nav = useNavigate();
  const [status, setStatus] = useState(''); const [open, setOpen] = useState(null);
  const q = useQuery({ queryKey: ['enquiries', status], queryFn: () => full(`/enquiries${status ? `?status=${status}` : ''}`) });
  const counts = q.data?.counts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const done = () => { qc.invalidateQueries({ queryKey: ['enquiries'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const setSt = useMutation({ mutationFn: ({ id, status }) => patch(`/enquiries/${id}/status`, { status }), onSuccess: () => { done(); toast('Status updated', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const conv = useMutation({ mutationFn: (id) => post(`/enquiries/${id}/convert-to-estimate`), onSuccess: (e) => { done(); toast(`Estimate ${e.estimateNo} created`, 'ok'); nav(`/estimates/${e._id}`); }, onError: (e) => toast(e.message, 'bad') });
  const cur = open && (q.data?.data || []).find((e) => e._id === open);
  return (
    <>
      <PageHead title="Enquiries" sub="Custom requests from the website, ready to turn into estimates." />
      <div className="tabs">{ENQ.map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}<span>{k ? counts[k] || 0 : all}</span></button>)}</div>
      <div className="card">
        {q.isLoading ? <Loading /> : (q.data?.data || []).length === 0 ? <Empty title="No enquiries" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Ref</th><th>From</th><th>Details</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>{q.data.data.map((e) => (
              <tr key={e._id} className="click" onClick={() => setOpen(e._id)}>
                <td className="mono">{e.refNo}</td><td><b>{e.company || e.name}</b><div className="muted small">{e.name}</div></td>
                <td style={{ maxWidth: 380 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.details}</div></td><td><StatusBadge s={e.status} /></td><td className="muted">{ago(e.createdAt)}</td>
              </tr>
            ))}</tbody></table></div>
        )}
      </div>
      {cur && (
        <Drawer title={cur.refNo} onClose={() => setOpen(null)} footer={
          <>
            {cur.status !== 'converted' && <button className="btn btn-primary" disabled={conv.isPending} onClick={() => conv.mutate(cur._id)}>Convert to estimate</button>}
            {cur.status === 'new' && <button className="btn btn-outline" onClick={() => setSt.mutate({ id: cur._id, status: 'in_discussion' })}>Mark in discussion</button>}
            {cur.status !== 'closed' && cur.status !== 'converted' && <button className="btn btn-outline" onClick={() => setSt.mutate({ id: cur._id, status: 'closed' })}>Close</button>}
          </>
        }>
          <div className="row between mb"><StatusBadge s={cur.status} />{cur.convertedTo && <Badge tone="ok">{cur.convertedTo}</Badge>}</div>
          <div className="kv mb"><div><small>Name</small><b>{cur.name}</b></div><div><small>Company</small><b>{cur.company || '–'}</b></div><div><small>Phone</small><b>{cur.phone}</b></div><div><small>Email</small><b style={{ wordBreak: 'break-all' }}>{cur.email}</b></div></div>
          <h3>Project details</h3><p style={{ whiteSpace: 'pre-wrap' }}>{cur.details}</p>
        </Drawer>
      )}
    </>
  );
}
