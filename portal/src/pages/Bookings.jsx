import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STAGES, STAGE_LABEL, STAGE_ROLES, nextStage } from 'shared';
import { full, get, patch, post, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Drawer, Empty, ErrorBox, Field, LevelBadge, Live, Loading, Modal, PageHead, Pager, StageBadge, fmtDate, fmtDateTime, todayStr, useDebounced, useToast } from '../ui';

const TABS = [['all', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];

function Detail({ id, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const q = useQuery({ queryKey: ['bookings', 'one', id], queryFn: () => get(`/bookings/${id}`) });
  const b = q.data;
  const done = () => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['booking-stats'] }); };
  const move = useMutation({ mutationFn: (stage) => patch(`/bookings/${id}/stage`, { stage }), onSuccess: () => { done(); toast('Stage updated', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const can = user.role === 'admin' || user.role === 'office';
  const nx = b && nextStage(b.stage);
  const allowed = nx && STAGE_ROLES[nx]?.includes(user.role);

  return (
    <Drawer title={id} onClose={onClose} footer={b && b.stage !== 'cancelled' && (
      <>
        {allowed && <button className="btn btn-primary" disabled={move.isPending} onClick={() => move.mutate(nx)}>Mark: {STAGE_LABEL[nx]}</button>}
        {can && b.stage === 'booked' && <button className="btn btn-outline" onClick={() => setModal('reschedule')}>Reschedule</button>}
        {can && b.stage === 'booked' && <button className="btn btn-outline" onClick={() => setModal('pilot')}>Change pilot</button>}
        {can && ['booked', 'checked_in'].includes(b.stage) && <button className="btn btn-danger" onClick={() => setModal('cancel')}>Cancel</button>}
      </>
    )}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
        <>
          <div className="row between mb"><StageBadge stage={b.stage} /><Badge tone={b.source === 'website' ? 'teal' : 'gray'}>{b.source}</Badge></div>
          <div className="kv mb">
            <div><small>Date</small><b>{fmtDate(b.date)}</b></div>
            <div><small>Slot</small><b>{b.slotId?.name}</b></div>
            <div><small>Pilot</small><b className="mono">{b.pilotId?.code}</b> {b.pilotId?.level && <LevelBadge level={b.pilotId.level} />}</div>
            <div><small>Project</small><b>{b.projectType}</b></div>
            <div><small>Location</small><b>{b.location}</b></div>
            <div><small>Flight hours</small><b>{b.flightHours}</b></div>
          </div>
          <h3 className="mb">Client</h3>
          <div className="kv mb">
            <div><small>Name</small><b>{b.contact?.name}</b></div>
            <div><small>Company</small><b>{b.contact?.company || '–'}</b></div>
            <div><small>Phone</small><b>{b.contact?.phone}</b></div>
            <div><small>Email</small><b style={{ wordBreak: 'break-all' }}>{b.contact?.email || '–'}</b></div>
          </div>
          {b.notes && <><h3>Notes</h3><p className="muted">{b.notes}</p></>}
          {b.cancelReason && <div className="alert bad">Cancelled: {b.cancelReason}</div>}
          <h3 className="mb">History</h3>
          <ul className="timeline">{(b.stageHistory || []).map((h, i) => <li key={i}><b>{STAGE_LABEL[h.stage] || h.stage}</b><div className="muted small">{fmtDateTime(h.at)} · {h.by}</div></li>)}</ul>
        </>
      )}
      {modal === 'cancel' && <CancelModal id={id} onClose={() => setModal(null)} done={done} />}
      {modal === 'reschedule' && <RescheduleModal b={b} onClose={() => setModal(null)} done={done} />}
      {modal === 'pilot' && <PilotModal b={b} onClose={() => setModal(null)} done={done} />}
    </Drawer>
  );
}

function CancelModal({ id, onClose, done }) {
  const [reason, setReason] = useState('');
  const toast = useToast();
  const m = useMutation({ mutationFn: () => patch(`/bookings/${id}/cancel`, { reason: reason || 'Cancelled by office' }), onSuccess: () => { done(); toast('Booking cancelled. The slot is free again.', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Cancel this booking?" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Keep booking</button><button className="btn btn-danger" disabled={m.isPending} onClick={() => m.mutate()}>Cancel booking</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>The slot becomes available again on the website straight away.</p>
      <Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client postponed" /></Field>
    </Modal>
  );
}

function RescheduleModal({ b, onClose, done }) {
  const [date, setDate] = useState(b.date);
  const [slotId, setSlotId] = useState(b.slotId?._id);
  const toast = useToast();
  const slots = useQuery({ queryKey: ['masters', 'slot'], queryFn: () => get('/masters/slot') });
  const m = useMutation({ mutationFn: () => patch(`/bookings/${b.bookingId}/reschedule`, { date, slotId }), onSuccess: () => { done(); toast('Booking rescheduled', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Reschedule" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>Save</button></>}>
      <div className="frow">
        <Field label="Date"><input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Slot"><select value={slotId} onChange={(e) => setSlotId(e.target.value)}>{(slots.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
      </div>
      {m.error && <div className="alert bad">{m.error.message}</div>}
    </Modal>
  );
}

function PilotModal({ b, onClose, done }) {
  const [pilotId, setPilotId] = useState('');
  const toast = useToast();
  const pilots = useQuery({ queryKey: ['pilots'], queryFn: () => get('/pilots') });
  const m = useMutation({ mutationFn: () => patch(`/bookings/${b.bookingId}/assign-pilot`, { pilotId }), onSuccess: () => { done(); toast('Pilot changed', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Change pilot" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={!pilotId || m.isPending} onClick={() => m.mutate()}>Assign</button></>}>
      <Field label="Pilot">
        <select value={pilotId} onChange={(e) => setPilotId(e.target.value)}>
          <option value="">Select a pilot</option>
          {(pilots.data || []).filter((p) => p.status === 'active' && p._id !== b.pilotId?._id).map((p) => <option key={p._id} value={p._id}>{p.code} · {p.level} · {p.baseCity}</option>)}
        </select>
      </Field>
      <p className="muted small">If that pilot is unavailable or already booked in this slot, you will see a clear message.</p>
      {m.error && <div className="alert bad">{m.error.message}</div>}
    </Modal>
  );
}

function PhoneBooking({ onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ projectType: '', location: '', date: todayStr(), pilotId: '', slotId: '', name: '', company: '', phone: '', email: '', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const masters = (k) => useQuery({ queryKey: ['masters', k], queryFn: () => get(`/masters/${k}`) }); // eslint-disable-line react-hooks/rules-of-hooks
  const types = masters('projectType'); const cities = masters('city');
  const pilots = useQuery({ queryKey: ['pilots'], queryFn: () => get('/pilots') });
  const av = useQuery({ queryKey: ['availability', 'one-day', f.date], queryFn: () => get(`/availability${qs({ from: f.date, to: f.date })}`) });
  const slots = masters('slot');
  const off = new Set((av.data?.off || []).map((a) => a.pilotId));
  const taken = new Set((av.data?.booked || []).filter((x) => x.pilotId && x.slotId).map((x) => `${x.pilotId}:${x.slotId}`));
  const free = (pilots.data || []).filter((p) => p.status === 'active' && !off.has(p._id) && p.certExpiry && new Date(p.certExpiry) > new Date());
  const m = useMutation({
    mutationFn: () => post('/bookings', f),
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast(`Booking ${b.bookingId} created`, 'ok'); onClose(); },
    onError: (e) => toast(e.message, 'bad'),
  });
  const ready = f.projectType && f.location && f.pilotId && f.slotId && f.name && f.phone.length >= 10 && f.email;
  return (
    <Modal title="New phone booking" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={!ready || m.isPending} onClick={() => m.mutate()}>Create booking</button></>}>
      <div className="frow">
        <Field label="Project"><select value={f.projectType} onChange={set('projectType')}><option value="">Select</option>{(types.data || []).map((t) => <option key={t._id}>{t.name}</option>)}</select></Field>
        <Field label="City"><select value={f.location} onChange={set('location')}><option value="">Select</option>{(cities.data || []).map((t) => <option key={t._id}>{t.name}</option>)}</select></Field>
      </div>
      <div className="frow3">
        <Field label="Date"><input type="date" min={todayStr()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, pilotId: '', slotId: '' })} /></Field>
        <Field label="Pilot"><select value={f.pilotId} onChange={(e) => setF({ ...f, pilotId: e.target.value, slotId: '' })}><option value="">Select</option>{free.map((p) => <option key={p._id} value={p._id}>{p.code} · {p.level}</option>)}</select></Field>
        <Field label="Slot"><select value={f.slotId} onChange={set('slotId')} disabled={!f.pilotId}><option value="">Select</option>{(slots.data || []).map((s) => <option key={s._id} value={s._id} disabled={taken.has(`${f.pilotId}:${s._id}`)}>{s.name}{taken.has(`${f.pilotId}:${s._id}`) ? ' (booked)' : ''}</option>)}</select></Field>
      </div>
      <div className="frow"><Field label="Client name"><input value={f.name} onChange={set('name')} /></Field><Field label="Company"><input value={f.company} onChange={set('company')} /></Field></div>
      <div className="frow"><Field label="Mobile"><input value={f.phone} onChange={set('phone')} /></Field><Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field></div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

export default function Bookings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('all');
  const [stage, setStage] = useState('all');
  const [source, setSource] = useState('all');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(search);
  useEffect(() => setPage(1), [tab, stage, source, date, dq]);

  const q = useQuery({ queryKey: ['bookings', 'list', tab, stage, source, date, dq, page], queryFn: () => full(`/bookings${qs({ tab: tab === 'all' ? '' : tab, stage, source, date, q: dq, page, limit: 12 })}`), placeholderData: (p) => p });
  const seen = useRef(new Set());
  const fresh = (b) => { const isNew = !seen.current.has(b._id) && seen.current.size > 0; return isNew; };
  const rows = q.data?.data || [];
  const flashIds = rows.filter(fresh).map((b) => b._id);
  useEffect(() => { rows.forEach((b) => seen.current.add(b._id)); }, [q.data]);

  const staff = user.role !== 'pilot';
  return (
    <>
      <PageHead title="Bookings" sub={staff ? 'Website, phone and estimate bookings in one list.' : 'Your assigned flights.'}>
        <Live />{staff && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ New phone booking</button>}
      </PageHead>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="toolbar">
        <input placeholder="Search ID, name or company" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
        <select value={stage} onChange={(e) => setStage(e.target.value)}><option value="all">All stages</option>{[...STAGES, 'cancelled'].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
        <select value={source} onChange={(e) => setSource(e.target.value)}><option value="all">All sources</option><option value="website">Website</option><option value="phone">Phone</option><option value="estimate">Estimate</option></select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {(stage !== 'all' || source !== 'all' || date || search) && <button className="btn btn-outline btn-sm" onClick={() => { setStage('all'); setSource('all'); setDate(''); setSearch(''); }}>Clear</button>}
      </div>
      <div className="card">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : rows.length === 0 ? <Empty title="No bookings match" sub="Try clearing the filters." /> : (
          <div className="tablewrap"><table className="tbl">
            <thead><tr><th>Booking</th><th>Client</th><th>Date</th><th>Slot</th><th>Pilot</th><th>Project</th><th>Source</th><th>Stage</th></tr></thead>
            <tbody>{rows.map((b) => (
              <tr key={b._id} className={`click ${flashIds.includes(b._id) ? 'flash' : ''}`} onClick={() => setOpen(b.bookingId)}>
                <td className="mono">{b.bookingId}</td>
                <td>{b.contact?.company || b.contact?.name}<div className="muted small">{b.contact?.name}</div></td>
                <td className="nowrap">{fmtDate(b.date)}</td><td>{b.slotId?.name}</td>
                <td className="mono">{b.pilotId?.code}</td><td>{b.projectType}</td>
                <td><Badge tone={b.source === 'website' ? 'teal' : 'gray'}>{b.source}</Badge></td><td><StageBadge stage={b.stage} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Pager page={page} limit={12} total={q.data?.total || 0} onPage={setPage} />
      </div>
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
      {adding && <PhoneBooking onClose={() => setAdding(false)} />}
    </>
  );
}
