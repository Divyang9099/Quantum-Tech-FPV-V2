import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, full, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBox, Field, Kpi, Loading, Modal, PageHead, StatusBadge, fmtDate, useToast } from '../ui';

// ---------------- Fleet ----------------
export function Fleet() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [report, setReport] = useState(null); const [note, setNote] = useState(''); const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['fleet'], queryFn: () => full('/drones') });
  const set = useMutation({ mutationFn: ({ id, status }) => patch(`/drones/${id}/status`, { status }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fleet'] }); toast('Drone status updated', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const prob = useMutation({ mutationFn: () => post(`/drones/${report._id}/problem`, { note }), onSuccess: () => { toast('Thanks. The problem has been reported to the office.', 'ok'); setReport(null); setNote(''); }, onError: (e) => toast(e.message, 'bad') });
  const s = q.data?.stats; const staff = user.role !== 'pilot'; const soon = Date.now() + 30 * 864e5;
  const rows = (q.data?.data || []).filter((d) => !filter || d.status === filter);
  return (
    <>
      <PageHead title="Fleet" sub="Drones, their status and service dates." />
      <div className="grid g4 mb"><Kpi label="Free" value={s?.free ?? '–'} /><Kpi label="In use" value={s?.in_use ?? '–'} /><Kpi label="In repair" value={s?.repair ?? '–'} /><Kpi label="Service due in 30 days" value={s?.serviceDue ?? '–'} /></div>
      <div className="toolbar"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All drones</option><option value="free">Free</option><option value="in_use">In use</option><option value="repair">In repair</option></select></div>
      <div className="card">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Code</th><th>Type</th><th>Status</th><th>Flight cycles</th><th>Service due</th><th /></tr></thead>
            <tbody>{rows.map((d) => {
              const due = d.serviceDueDate && new Date(d.serviceDueDate).getTime();
              return (
                <tr key={d._id}>
                  <td className="mono">{d.code}</td><td>{d.type}</td><td><StatusBadge s={d.status} /></td><td>{d.cycles}</td>
                  <td>{due ? <Badge tone={due < Date.now() ? 'bad' : due < soon ? 'warn' : 'gray'}>{fmtDate(d.serviceDueDate)}</Badge> : '–'}</td>
                  <td className="right">
                    {staff ? <select style={{ width: 130 }} value={d.status} onChange={(e) => set.mutate({ id: d._id, status: e.target.value })}><option value="free">Free</option><option value="in_use">In use</option><option value="repair">In repair</option></select>
                      : <button className="btn btn-outline btn-sm" onClick={() => setReport(d)}>Report a problem</button>}
                  </td>
                </tr>
              );
            })}</tbody></table></div>
        )}
      </div>
      {report && (
        <Modal title={`Report a problem · ${report.code}`} onClose={() => setReport(null)} footer={<><button className="btn btn-outline" onClick={() => setReport(null)}>Close</button><button className="btn btn-primary" disabled={!note || prob.isPending} onClick={() => prob.mutate()}>Send report</button></>}>
          <Field label="What went wrong?"><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}

// ---------------- Documents ----------------
function AddDoc({ onClose }) {
  const toast = useToast(); const qc = useQueryClient();
  const types = useQuery({ queryKey: ['masters', 'docType'], queryFn: () => get('/masters/docType') });
  const [f, setF] = useState({ type: '', title: '', expiryDate: '', fileUrl: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({ mutationFn: () => post('/documents', { ...f, expiryDate: f.expiryDate || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast('Document added', 'ok'); onClose(); }, onError: (e) => toast(e.message, 'bad') });
  return (
    <Modal title="Add document" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={!f.type || !f.title || m.isPending} onClick={() => m.mutate()}>Save</button></>}>
      <Field label="Title"><input value={f.title} onChange={set('title')} /></Field>
      <div className="frow"><Field label="Type"><select value={f.type} onChange={set('type')}><option value="">Select</option>{(types.data || []).map((t) => <option key={t._id}>{t.name}</option>)}</select></Field><Field label="Expiry date"><input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field></div>
      <Field label="File link"><input value={f.fileUrl} onChange={set('fileUrl')} placeholder="https://…" /></Field>
    </Modal>
  );
}

export function Documents() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [adding, setAdding] = useState(false); const [type, setType] = useState('');
  const q = useQuery({ queryKey: ['documents'], queryFn: () => full('/documents') });
  const rm = useMutation({ mutationFn: (id) => del(`/documents/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast('Document deleted', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const s = q.data?.stats; const now = Date.now(); const soon = now + 30 * 864e5;
  const rows = (q.data?.data || []).filter((d) => !type || d.type === type);
  return (
    <>
      <PageHead title="Documents" sub={user.role === 'pilot' ? 'Documents for your bookings.' : 'Permissions, insurance, NOCs and licences with expiry tracking.'}>{user.role === 'admin' && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add document</button>}</PageHead>
      {s && <div className="grid g3 mb"><Kpi label="Total documents" value={s.total} /><Kpi label="Expiring in 30 days" value={s.expiring} /><Kpi label="Expired" value={s.expired} /></div>}
      {s && <div className="toolbar"><select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{[...new Set(q.data.data.map((d) => d.type))].map((t) => <option key={t}>{t}</option>)}</select></div>}
      <div className="card">
        {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty title="No documents" /> : (
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Title</th><th>Type</th><th>Linked to</th><th>Expiry</th>{user.role === 'admin' && <th />}</tr></thead>
            <tbody>{rows.map((d) => {
              const e = d.expiryDate && new Date(d.expiryDate).getTime();
              return (
                <tr key={d._id}><td><b>{d.title}</b></td><td>{d.type}</td><td className="mono">{d.linkedTo?.id || '–'}</td>
                  <td>{e ? <Badge tone={e < now ? 'bad' : e < soon ? 'warn' : 'ok'}>{e < now ? 'Expired ' : ''}{fmtDate(d.expiryDate)}</Badge> : '–'}</td>
                  {user.role === 'admin' && <td className="right"><button className="btn btn-danger btn-sm" onClick={() => window.confirm('Delete this document?') && rm.mutate(d._id)}>Delete</button></td>}
                </tr>
              );
            })}</tbody></table></div>
        )}
      </div>
      {adding && <AddDoc onClose={() => setAdding(false)} />}
    </>
  );
}
