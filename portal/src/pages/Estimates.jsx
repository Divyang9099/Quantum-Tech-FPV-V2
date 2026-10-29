import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { calculateEstimate } from 'shared';
import { download, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBox, Field, Kpi, Loading, Modal, PageHead, StatusBadge, fmtDate, inr, todayStr, useDebounced, useToast } from '../ui';

const TABS = [['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['rejected', 'Rejected']];

export function Estimates() {
  const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['estimates', status], queryFn: () => get(`/estimates${status ? `?status=${status}` : ''}`) });
  const st = useQuery({ queryKey: ['estimates', 'stats'], queryFn: () => get('/estimates/stats') });
  const create = useMutation({ mutationFn: () => post('/estimates', { clientName: 'New client', projectType: 'Survey', scenarioName: 'Base', inputs: { flightDays: 1, postDays: 1, teamSize: 2, pilots: 1, drones: 1, trips: 1 } }), onSuccess: (e) => { qc.invalidateQueries({ queryKey: ['estimates'] }); nav(`/estimates/${e._id}`); }, onError: (e) => toast(e.message, 'bad') });
  const f = st.data?.funnel || [];
  return (
    <>
      <PageHead title="Estimates" sub="Price a job, send a clear quotation, turn acceptance into bookings."><button className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>+ New estimate</button></PageHead>
      <div className="grid g4 mb">
        <Kpi label="Sent this month" value={st.data?.sentThisMonth ?? '–'} /><Kpi label="Acceptance rate" value={`${st.data?.acceptancePct ?? 0}%`} />
        <Kpi label="Open pipeline" value={inr(st.data?.pipeline)} sub="value of sent estimates" /><Kpi label="Drafts" value={st.data?.byStatus?.find((s) => s.status === 'draft')?.n ?? 0} />
      </div>
      {f.length > 0 && (
        <Card title="Enquiry to booking" style={{ marginBottom: 16 }}>
          <div className="grid g4">{f.map((x, i) => <div key={x.stage}><div className="muted small">{x.stage}</div><b style={{ fontSize: 22 }}>{x.n}</b>{i > 0 && f[i - 1].n > 0 && <span className="muted small"> · {Math.round((x.n / f[i - 1].n) * 100)}%</span>}</div>)}</div>
        </Card>
      )}
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="card">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (q.data || []).length === 0 ? <Empty title="No estimates" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>No.</th><th>Client</th><th>Scenario</th><th>Project</th><th className="right">Total</th><th>Status</th><th>Valid until</th></tr></thead>
            <tbody>{q.data.map((e) => <tr key={e._id} className="click" onClick={() => nav(`/estimates/${e._id}`)}><td className="mono">{e.estimateNo}</td><td><b>{e.clientName}</b></td><td>{e.scenarioName}</td><td>{e.projectType}</td><td className="right">{inr(e.totals?.grand)}</td><td><StatusBadge s={e.status} /></td><td>{fmtDate(e.validUntil)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </>
  );
}

const Num = ({ label, k, v, set, step = 1, disabled }) => (
  <Field label={label}><input type="number" min="0" step={step} value={v[k] ?? ''} disabled={disabled} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} /></Field>
);

function BookModal({ est, onClose }) {
  const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient();
  const pilots = useQuery({ queryKey: ['pilots'], queryFn: () => get('/pilots') });
  const slots = useQuery({ queryKey: ['masters', 'slot'], queryFn: () => get('/masters/slot') });
  const days = est.inputs?.flightDays || 1;
  const [pilotId, setPilotId] = useState(''); const [slotId, setSlotId] = useState('');
  const [start, setStart] = useState(todayStr()); const [location, setLocation] = useState('Client site');
  const dates = Array.from({ length: days }, (_, i) => new Date(new Date(start + 'T00:00:00').getTime() + i * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10));
  const m = useMutation({ mutationFn: () => post(`/estimates/${est._id}/create-booking`, { pilotId, slotId, dates, location }), onSuccess: (b) => { qc.invalidateQueries({ queryKey: ['bookings'] }); toast(`${b.length} booking(s) created`, 'ok'); nav('/bookings'); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Create bookings from this estimate" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={!pilotId || !slotId || m.isPending} onClick={() => m.mutate()}>Create {days} booking{days > 1 ? 's' : ''}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>One booking per flight day. If any day is not free, none are created.</p>
      <div className="frow"><Field label="First flight day"><input type="date" min={todayStr()} value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} /></Field></div>
      <div className="frow">
        <Field label="Pilot"><select value={pilotId} onChange={(e) => setPilotId(e.target.value)}><option value="">Select</option>{(pilots.data || []).filter((p) => p.status === 'active').map((p) => <option key={p._id} value={p._id}>{p.code} · {p.level}</option>)}</select></Field>
        <Field label="Slot"><select value={slotId} onChange={(e) => setSlotId(e.target.value)}><option value="">Select</option>{(slots.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
      </div>
      <div className="muted small">Dates: {dates.map(fmtDate).join(', ')}</div>
      {m.error && <div className="alert bad mt">{m.error.message}</div>}
    </Modal>
  );
}

export function EstimateEditor() {
  const { id } = useParams(); const { user } = useAuth(); const nav = useNavigate();
  const toast = useToast(); const qc = useQueryClient();
  const admin = user.role === 'admin';
  const q = useQuery({ queryKey: ['estimates', id], queryFn: () => get(`/estimates/${id}`) });
  const rates = useQuery({ queryKey: ['rates'], queryFn: () => get('/settings/rate-library') });
  const [meta, setMeta] = useState(null); const [inp, setInp] = useState(null); const [server, setServer] = useState(null); const [booking, setBooking] = useState(false);

  useEffect(() => { if (q.data && !inp) { setInp(q.data.inputs || {}); setMeta({ clientName: q.data.clientName, scenarioName: q.data.scenarioName, projectType: q.data.projectType }); } }, [q.data]);
  const set = (k, v) => setInp((x) => ({ ...x, [k]: v }));
  const locked = q.data && q.data.status !== 'draft';

  // Admin sees the exact same calculator the server runs. Office gets the figures back from the server (no margin fields are ever sent to them).
  const local = useMemo(() => (admin && inp ? calculateEstimate(inp) : null), [admin, inp]);
  const dInp = useDebounced(inp, 250);
  useEffect(() => { if (!admin && dInp) post('/estimates/calculate', { ...dInp, id }).then(setServer).catch(() => {}); }, [admin, dInp, id]);
  const t = admin ? local : server || q.data?.totals;

  const refresh = () => { qc.invalidateQueries({ queryKey: ['estimates'] }); };
  const save = useMutation({ mutationFn: () => patch(`/estimates/${id}`, { ...meta, inputs: inp }), onSuccess: (e) => { refresh(); qc.setQueryData(['estimates', id], e); toast('Estimate saved', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const act = useMutation({ mutationFn: (a) => patch(`/estimates/${id}/${a}`), onSuccess: (e, a) => { refresh(); qc.setQueryData(['estimates', id], e); toast(`Estimate ${a === 'send' ? 'sent' : a === 'accept' ? 'accepted' : 'rejected'}`, 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const dup = useMutation({ mutationFn: () => post(`/estimates/${id}/duplicate`), onSuccess: (e) => { refresh(); toast('Duplicated as a new draft scenario', 'ok'); setInp(null); nav(`/estimates/${e._id}`); }, onError: (e) => toast(e.message, 'bad') });

  if (q.isLoading || !inp) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const e = q.data; const r = rates.data;
  const pick = (kind, name, rk, ck) => { set(ck, r?.[kind]?.[name] ?? 0); if (rk) set(rk, name); };
  const hasPct = inp.marginPct !== undefined;
  const buffer = t && t.gst !== undefined ? t.grand - t.gst - t.direct : 0;

  return (
    <>
      <PageHead title={`${e.estimateNo} · ${meta.scenarioName}`} sub={<><StatusBadge s={e.status} /> <span className="muted">Version {e.version} · valid until {fmtDate(e.validUntil)}</span></>}>
        <button className="btn btn-outline" onClick={() => nav('/estimates')}>← All estimates</button>
        <button className="btn btn-outline" onClick={() => download(`/estimates/${id}/pdf`, `${e.estimateNo}.pdf`).catch((x) => toast(x.message, 'bad'))}>Client PDF</button>
        <button className="btn btn-outline" onClick={() => download(`/estimates/${id}/excel`, `${e.estimateNo}.xlsx`).catch((x) => toast(x.message, 'bad'))}>Excel</button>
        <button className="btn btn-outline" onClick={() => dup.mutate()}>Duplicate scenario</button>
      </PageHead>
      {locked && <div className="alert info">This estimate is {e.status}, so it can no longer be edited. Duplicate it to try another scenario.</div>}
      <div className="est">
        <div>
          <Card title="Job" style={{ marginBottom: 16 }}>
            <div className="frow3">
              <Field label="Client"><input value={meta.clientName || ''} disabled={locked} onChange={(x) => setMeta({ ...meta, clientName: x.target.value })} /></Field>
              <Field label="Scenario"><input value={meta.scenarioName || ''} disabled={locked} onChange={(x) => setMeta({ ...meta, scenarioName: x.target.value })} /></Field>
              <Field label="Project"><input value={meta.projectType || ''} disabled={locked} onChange={(x) => setMeta({ ...meta, projectType: x.target.value })} /></Field>
            </div>
            <div className="frow3"><Num label="Flight days" k="flightDays" v={inp} set={set} disabled={locked} /><Num label="Post-processing days" k="postDays" v={inp} set={set} disabled={locked} /><Num label="Team size" k="teamSize" v={inp} set={set} disabled={locked} /></div>
          </Card>
          <Card title="People and equipment" style={{ marginBottom: 16 }}>
            <div className="frow3">
              <Num label="Pilots" k="pilots" v={inp} set={set} disabled={locked} />
              <Field label="Pilot level"><select disabled={locked} onChange={(x) => pick('pilotRates', x.target.value, null, 'pilotRate')} defaultValue=""><option value="">Pick to fill rate</option>{Object.keys(r?.pilotRates || {}).map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Num label="Pilot rate / day (₹)" k="pilotRate" v={inp} set={set} disabled={locked} />
              <Num label="Co-pilots" k="copilots" v={inp} set={set} disabled={locked} /><span />
              <Num label="Co-pilot rate / day (₹)" k="copilotRate" v={inp} set={set} disabled={locked} />
              <Num label="Drones" k="drones" v={inp} set={set} disabled={locked} />
              <Field label="Drone type"><select disabled={locked} onChange={(x) => pick('droneRates', x.target.value, null, 'droneRate')} defaultValue=""><option value="">Pick to fill rate</option>{Object.keys(r?.droneRates || {}).map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Num label="Drone rate / day (₹)" k="droneRate" v={inp} set={set} disabled={locked} />
            </div>
          </Card>
          <Card title="Travel, stay and food" style={{ marginBottom: 16 }}>
            <div className="frow3">
              <Num label="Distance one way (km)" k="distanceKm" v={inp} set={set} disabled={locked} /><Num label="Trips" k="trips" v={inp} set={set} disabled={locked} /><Num label="Rate per km (₹)" k="ratePerKm" v={inp} set={set} disabled={locked} />
              <Num label="Local travel / day (₹)" k="dailyTravel" v={inp} set={set} disabled={locked} /><Num label="Hotel nights" k="hotelNights" v={inp} set={set} disabled={locked} /><Num label="Hotel / night (₹)" k="hotelRate" v={inp} set={set} disabled={locked} />
              <Num label="Food / person / day (₹)" k="foodPerDay" v={inp} set={set} disabled={locked} />
            </div>
          </Card>
          <Card title="Software and reporting" style={{ marginBottom: 16 }}>
            <div className="frow3"><Num label="Software cost (₹)" k="softwareCost" v={inp} set={set} disabled={locked} /><Num label="Report hours" k="reportHours" v={inp} set={set} disabled={locked} /><Num label="Report rate / hour (₹)" k="reportRate" v={inp} set={set} disabled={locked} /><Num label="Data storage (₹)" k="dataStorage" v={inp} set={set} disabled={locked} /></div>
          </Card>
          {admin && hasPct && (
            <Card title="Commercials (admin only)">
              <div className="frow3"><Num label="Overhead %" k="overheadPct" v={inp} set={set} disabled={locked} /><Num label="Contingency %" k="contingencyPct" v={inp} set={set} disabled={locked} /><Num label="Margin %" k="marginPct" v={inp} set={set} disabled={locked} /></div>
              <Num label="GST %" k="taxPct" v={inp} set={set} disabled={locked} />
            </Card>
          )}
        </div>

        <div className="sticky">
          <Card title="Live breakdown">
            {!t ? <Loading /> : (
              <>
                {admin && t.lines && [['Pilots', 'pilots'], ['Co-pilots', 'copilots'], ['Drones', 'drones'], ['Travel', 'travel'], ['Hotel', 'hotel'], ['Food', 'food'], ['Software', 'software'], ['Report', 'report']].map(([l, k]) => <div key={k} className="brk"><span>{l}</span><span>{inr(t.lines[k])}</span></div>)}
                <div className="brk t"><span>Direct cost</span><span>{inr(t.direct)}</span></div>
                {admin ? (
                  <>
                    <div className="brk lock"><span>Overhead ({inp.overheadPct}%)</span><span>{inr(t.overhead)}</span></div>
                    <div className="brk lock"><span>Contingency ({inp.contingencyPct}%)</span><span>{inr(t.contingency)}</span></div>
                    <div className="brk t"><span>Subtotal</span><span>{inr(t.subtotal)}</span></div>
                    <div className="brk lock"><span>Margin ({inp.marginPct}%)</span><span>{inr(t.margin)}</span></div>
                  </>
                ) : <div className="brk lock"><span>Overheads, contingency and margin</span><span>Included</span></div>}
                <div className="brk"><span>GST</span><span>{inr(t.gst)}</span></div>
                <div className="brk g"><span>Total</span><span>{inr(t.grand)}</span></div>
                <div className="muted small">About {inr(t.perDay)} per day{!admin && buffer > 0 ? '' : ''}</div>
              </>
            )}
          </Card>
          <div className="row wrap mt">
            {!locked && <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save changes</button>}
            {e.status === 'draft' && <button className="btn btn-outline" disabled={act.isPending} onClick={() => act.mutate('send')}>Mark as sent</button>}
            {e.status === 'sent' && <><button className="btn btn-primary" onClick={() => act.mutate('accept')}>Client accepted</button><button className="btn btn-danger" onClick={() => act.mutate('reject')}>Rejected</button></>}
            {e.status === 'accepted' && <button className="btn btn-primary" onClick={() => setBooking(true)}>Create bookings</button>}
          </div>
          {!admin && <p className="muted small mt">Overhead, contingency and margin are set by Admin and are not shown or editable for Office.</p>}
        </div>
      </div>
      {booking && <BookModal est={e} onClose={() => setBooking(false)} />}
    </>
  );
}
