import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { download, full, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Drawer, Empty, ErrorBox, Field, Kpi, LevelBadge, Loading, Modal, PageHead, StatusBadge, fmtDate, todayStr, useToast } from '../ui';

const useInvalidate = (...keys) => { const qc = useQueryClient(); return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };

// ---------------- Enrollment ----------------
function AddStudent({ onClose }) {
  const toast = useToast(); const inv = useInvalidate('students');
  const courses = useQuery({ queryKey: ['masters', 'course'], queryFn: () => get('/masters/course') });
  const [f, setF] = useState({ name: '', phone: '', email: '', course: '', partnerCompany: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({ mutationFn: () => post('/students', f), onSuccess: () => { inv(); toast('Student entered', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Enter a student" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={m.isPending || !f.name || !f.email || !f.course || f.phone.length < 10} onClick={() => m.mutate()}>Save</button></>}>
      <div className="frow"><Field label="Name"><input value={f.name} onChange={set('name')} /></Field><Field label="Mobile"><input value={f.phone} onChange={set('phone')} /></Field></div>
      <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
      <div className="frow"><Field label="Course"><select value={f.course} onChange={set('course')}><option value="">Select</option>{(courses.data || []).map((c) => <option key={c._id}>{c.name}</option>)}</select></Field><Field label="Partner company (optional)"><input value={f.partnerCompany} onChange={set('partnerCompany')} /></Field></div>
    </Modal>
  );
}

export function Students() {
  const toast = useToast(); const inv = useInvalidate('students', 'batches');
  const [adding, setAdding] = useState(false); const [open, setOpen] = useState(null);
  const q = useQuery({ queryKey: ['students'], queryFn: () => get('/students') });
  const st = useQuery({ queryKey: ['students', 'stats'], queryFn: () => get('/students/stats') });
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => full('/batches') });
  const verify = useMutation({ mutationFn: (id) => patch(`/students/${id}/verify-documents`), onSuccess: () => { inv(); toast('Documents verified', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const fee = useMutation({ mutationFn: ({ id, feeStatus }) => patch(`/students/${id}/fee-status`, { feeStatus }), onSuccess: () => { inv(); toast('Fee status updated', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const join = useMutation({ mutationFn: ({ batch, id }) => post(`/batches/${batch}/students`, { studentId: id }), onSuccess: () => { inv(); toast('Student added to the batch', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const cur = open && (q.data || []).find((s) => s._id === open);
  const top = st.data?.funnel?.[0]?.n || 1;
  return (
    <>
      <PageHead title="Enrollment" sub="From first entry to a seat in a batch."><button className="btn btn-primary" onClick={() => setAdding(true)}>+ Enter student</button></PageHead>
      <Card title="Enrollment pipeline" style={{ marginBottom: 16 }}>
        <div className="grid g4">{(st.data?.funnel || []).map((f, i) => <div key={f.stage}><div className="muted small">{f.stage}</div><b style={{ fontSize: 22 }}>{f.n}</b><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${(f.n / top) * 100}%`, opacity: 1 - i * 0.15 }} /></div></div>)}</div>
      </Card>
      <div className="card">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Name</th><th>Course</th><th>Partner</th><th>Documents</th><th>Fee</th><th>Batch</th><th>Status</th></tr></thead>
            <tbody>{q.data.map((s) => (
              <tr key={s._id} className="click" onClick={() => setOpen(s._id)}>
                <td><b>{s.name}</b><div className="muted small">{s.phone}</div></td><td>{s.course}</td><td>{s.partnerCompany || '–'}</td>
                <td>{s.docs.length && s.docs.every((d) => d.verified) ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Pending</Badge>}</td>
                <td><StatusBadge s={s.feeStatus} /></td><td>{s.batchId?.name || '–'}</td><td><StatusBadge s={s.status} /></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </div>
      {adding && <AddStudent onClose={() => setAdding(false)} />}
      {cur && (
        <Drawer title={cur.name} onClose={() => setOpen(null)}>
          <div className="kv mb"><div><small>Course</small><b>{cur.course}</b></div><div><small>Status</small><StatusBadge s={cur.status} /></div><div><small>Phone</small><b>{cur.phone}</b></div><div><small>Email</small><b style={{ wordBreak: 'break-all' }}>{cur.email}</b></div></div>
          <h3 className="mb">Documents</h3>
          {cur.docs.map((d) => <div key={d.name} className="row between" style={{ padding: '6px 0' }}><span>{d.name}</span><Badge tone={d.verified ? 'ok' : 'warn'}>{d.verified ? 'Verified' : 'Pending'}</Badge></div>)}
          {!cur.docs.every((d) => d.verified) && <button className="btn btn-primary mt" onClick={() => verify.mutate(cur._id)}>Verify all documents</button>}
          <h3 className="mb mt">Fee</h3>
          <div className="row"><StatusBadge s={cur.feeStatus} /><button className="btn btn-outline btn-sm" onClick={() => fee.mutate({ id: cur._id, feeStatus: cur.feeStatus === 'paid' ? 'unpaid' : 'paid' })}>Mark as {cur.feeStatus === 'paid' ? 'unpaid' : 'paid'}</button></div>
          {!cur.batchId && ['verified', 'entered'].includes(cur.status) && (
            <>
              <h3 className="mb mt">Add to a batch</h3>
              {(batches.data?.data || []).filter((b) => b.status !== 'completed').map((b) => (
                <div key={b._id} className="row between" style={{ padding: '6px 0' }}><span>{b.name}<div className="muted small">{b.studentIds.length}/{b.seats} seats</div></span><button className="btn btn-outline btn-sm" disabled={b.studentIds.length >= b.seats} onClick={() => join.mutate({ batch: b._id, id: cur._id })}>{b.studentIds.length >= b.seats ? 'Full' : 'Add'}</button></div>
              ))}
            </>
          )}
        </Drawer>
      )}
    </>
  );
}

// ---------------- Batches ----------------
function AddBatch({ onClose }) {
  const toast = useToast(); const inv = useInvalidate('batches');
  const courses = useQuery({ queryKey: ['masters', 'course'], queryFn: () => get('/masters/course') });
  const [f, setF] = useState({ name: '', course: '', instructor: '', startDate: todayStr(), seats: 12 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({ mutationFn: () => post('/batches', f), onSuccess: () => { inv(); toast('Batch created', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="New batch" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={m.isPending || !f.name || !f.course || !f.instructor} onClick={() => m.mutate()}>Create</button></>}>
      <Field label="Batch name"><input value={f.name} onChange={set('name')} placeholder="e.g. FPV Foundation, Nov 2026" /></Field>
      <div className="frow"><Field label="Course"><select value={f.course} onChange={set('course')}><option value="">Select</option>{(courses.data || []).map((c) => <option key={c._id}>{c.name}</option>)}</select></Field><Field label="Instructor"><input value={f.instructor} onChange={set('instructor')} /></Field></div>
      <div className="frow"><Field label="Start date"><input type="date" value={f.startDate} onChange={set('startDate')} /></Field><Field label="Seats"><input type="number" min="1" value={f.seats} onChange={set('seats')} /></Field></div>
    </Modal>
  );
}

function BatchDrawer({ id, onClose }) {
  const toast = useToast(); const inv = useInvalidate('batches', 'students', 'certificates');
  const q = useQuery({ queryKey: ['batches', id], queryFn: () => get(`/batches/${id}`) });
  const [marks, setMarks] = useState({}); const [present, setPresent] = useState({});
  const att = useMutation({ mutationFn: (records) => post(`/batches/${id}/attendance`, { date: todayStr(), records }), onSuccess: () => { inv(); toast("Today's attendance saved", 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const res = useMutation({ mutationFn: (v) => post(`/batches/${id}/test-results`, v), onSuccess: (r) => { inv(); toast(r.result === 'pass' ? 'Passed. A certificate is now waiting for admin approval.' : 'Marks saved (below the pass mark)', r.result === 'pass' ? 'ok' : ''); }, onError: (e) => toast(e.message, 'bad') });
  if (!q.data) return <Drawer title="Batch" onClose={onClose}><Loading /></Drawer>;
  const { batch, results, attendance } = q.data;
  const resOf = (sid) => results.find((r) => r.studentId === sid);
  const today = attendance.find((a) => a.date === todayStr());
  const isP = (sid) => present[sid] ?? today?.records.find((r) => r.studentId === sid)?.present ?? true;
  const pct = (sid) => { const t = attendance.length; return t ? Math.round((attendance.filter((a) => a.records.find((r) => r.studentId === sid)?.present).length / t) * 100) : null; };
  return (
    <Drawer title={batch.name} onClose={onClose}>
      <div className="kv mb"><div><small>Course</small><b>{batch.course}</b></div><div><small>Instructor</small><b>{batch.instructor}</b></div><div><small>Starts</small><b>{fmtDate(batch.startDate)}</b></div><div><small>Seats</small><b>{batch.studentIds.length} / {batch.seats}</b></div></div>
      <div className="row between mb"><h3>Students</h3>{batch.studentIds.length > 0 && <button className="btn btn-outline btn-sm" onClick={() => att.mutate(batch.studentIds.map((s) => ({ studentId: s._id, present: isP(s._id) })))}>Save attendance for today</button>}</div>
      {batch.studentIds.length === 0 && <p className="muted">No students yet. Add them from Enrollment.</p>}
      {batch.studentIds.map((s) => {
        const r = resOf(s._id);
        return (
          <div key={s._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="row between"><label className="row gap-sm" style={{ cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={isP(s._id)} onChange={(e) => setPresent({ ...present, [s._id]: e.target.checked })} /><b>{s.name}</b></label><span className="muted small">{pct(s._id) === null ? 'No attendance yet' : `${pct(s._id)}% attendance`}</span></div>
            <div className="row mt" style={{ marginTop: 8 }}>
              {r ? <Badge tone={r.result === 'pass' ? 'ok' : 'bad'}>{r.marks} marks · {r.result}</Badge> : <span className="muted small">No marks</span>}
              <input type="number" min="0" max="100" placeholder="Marks" style={{ width: 90 }} value={marks[s._id] ?? ''} onChange={(e) => setMarks({ ...marks, [s._id]: e.target.value })} />
              <button className="btn btn-outline btn-sm" disabled={marks[s._id] === undefined || marks[s._id] === ''} onClick={() => res.mutate({ studentId: s._id, marks: Number(marks[s._id]) })}>Save marks</button>
            </div>
          </div>
        );
      })}
      <p className="muted small mt">Pass mark is 50. A pass creates a certificate for Admin to approve.</p>
    </Drawer>
  );
}

export function Batches() {
  const [open, setOpen] = useState(null); const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['batches'], queryFn: () => full('/batches') });
  const s = q.data?.stats;
  return (
    <>
      <PageHead title="Batches" sub="Classes, attendance and test results."><button className="btn btn-primary" onClick={() => setAdding(true)}>+ New batch</button></PageHead>
      <div className="grid g3 mb"><Kpi label="Active batches" value={s?.active ?? '–'} /><Kpi label="In training now" value={s?.inTraining ?? '–'} /><Kpi label="Seats filled" value={s ? `${s.seatsFilled}/${s.seats}` : '–'} /></div>
      <div className="card">
        {q.isLoading ? <Loading /> : (q.data?.data || []).length === 0 ? <Empty title="No batches yet" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Batch</th><th>Course</th><th>Instructor</th><th>Start</th><th>Seats</th><th>Status</th></tr></thead>
            <tbody>{q.data.data.map((b) => <tr key={b._id} className="click" onClick={() => setOpen(b._id)}><td><b>{b.name}</b></td><td>{b.course}</td><td>{b.instructor}</td><td>{fmtDate(b.startDate)}</td><td style={{ minWidth: 130 }}>{b.studentIds.length}/{b.seats}<div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${(b.studentIds.length / b.seats) * 100}%` }} /></div></td><td><StatusBadge s={b.status} /></td></tr>)}</tbody></table></div>
        )}
      </div>
      {open && <BatchDrawer id={open} onClose={() => setOpen(null)} />}
      {adding && <AddBatch onClose={() => setAdding(false)} />}
    </>
  );
}

// ---------------- Certificates ----------------
export function Certificates() {
  const { user } = useAuth(); const toast = useToast(); const inv = useInvalidate('certificates', 'pilots', 'students', 'dashboard');
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['certificates', status], queryFn: () => full(`/certificates${status ? `?status=${status}` : ''}`) });
  const approve = useMutation({ mutationFn: (id) => patch(`/certificates/${id}/approve`, {}), onSuccess: (r) => { inv(); toast(`Approved. ${r.pilot.name} is now pilot ${r.pilot.code} and can log in.`, 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const s = q.data?.stats; const now = Date.now(); const soon = now + 30 * 864e5;
  return (
    <>
      <PageHead title="Certificates" sub="Approve passed students and track validity." />
      <div className="grid g4 mb"><Kpi label="Valid" value={s?.valid ?? '–'} /><Kpi label="Expiring in 30 days" value={s?.expiring ?? '–'} /><Kpi label="Expired" value={s?.expired ?? '–'} /><Kpi label="Waiting for approval" value={s?.pending ?? '–'} /></div>
      <div className="tabs">{[['', 'All'], ['pending', 'Pending approval'], ['approved', 'Approved']].map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="card">
        {q.isLoading ? <Loading /> : (q.data?.data || []).length === 0 ? <Empty title="No certificates" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Holder</th><th>Certificate no.</th><th>Level</th><th>Issued</th><th>Valid till</th><th>Status</th><th /></tr></thead>
            <tbody>{q.data.data.map((c) => {
              const exp = c.expiryDate && new Date(c.expiryDate).getTime();
              return (
                <tr key={c._id}>
                  <td><b>{c.holderName}</b></td><td className="mono">{c.certNo || '–'}</td><td><LevelBadge level={c.level} /></td><td>{fmtDate(c.issueDate)}</td>
                  <td>{c.status === 'approved' ? <Badge tone={exp < now ? 'bad' : exp < soon ? 'warn' : 'ok'}>{fmtDate(c.expiryDate)}</Badge> : '–'}</td><td><StatusBadge s={c.status} /></td>
                  <td className="right">
                    {c.status === 'pending' && (user.role === 'admin' ? <button className="btn btn-primary btn-sm" disabled={approve.isPending} onClick={() => approve.mutate(c._id)}>Approve</button> : <span className="muted small">Admin approves</span>)}
                    {c.status === 'approved' && <button className="btn btn-outline btn-sm" onClick={() => download(`/certificates/${c._id}/pdf`, `${c.certNo}.pdf`).catch((x) => toast(x.message, 'bad'))}>PDF</button>}
                  </td>
                </tr>
              );
            })}</tbody></table></div>
        )}
      </div>
    </>
  );
}
