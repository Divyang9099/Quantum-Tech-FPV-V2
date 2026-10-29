import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Drawer, ErrorBox, Live, Loading, PageHead, todayStr, useToast } from '../ui';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function Availability() {
  const { user } = useAuth();
  const staff = user.role !== 'pilot';
  const qc = useQueryClient();
  const toast = useToast();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [day, setDay] = useState(null);
  const [pilotPick, setPilotPick] = useState('');

  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(ym.y, ym.m + 1, 0).getDate();
  const from = iso(ym.y, ym.m, 1); const to = iso(ym.y, ym.m, total);

  const av = useQuery({ queryKey: ['availability', from, to], queryFn: () => get(`/availability${qs({ from, to })}`) });
  const pilots = useQuery({ queryKey: ['pilots'], queryFn: () => get('/pilots'), enabled: staff });
  const code = (id) => pilots.data?.find((p) => p._id === id)?.code || (staff ? '…' : 'You');

  const byDay = {};
  (av.data?.off || []).forEach((a) => { (byDay[a.date] ||= { off: [], booked: [] }).off.push(a); });
  (av.data?.booked || []).forEach((b) => { (byDay[b.date] ||= { off: [], booked: [] }).booked.push(b); });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['availability'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const mark = useMutation({ mutationFn: (v) => post('/availability', v), onSuccess: () => { refresh(); toast('Marked unavailable. The website no longer offers this pilot that day.', 'ok'); }, onError: (e) => toast(e.message, 'bad') });
  const unmark = useMutation({ mutationFn: (id) => del(`/availability/${id}`), onSuccess: () => { refresh(); toast('Marked available again', 'ok'); }, onError: (e) => toast(e.message, 'bad') });

  const shift = (n) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const info = day && (byDay[day] || { off: [], booked: [] });
  const myOff = day && !staff && info.off[0];
  const certified = (pilots.data || []).filter((p) => p.status === 'active');

  return (
    <>
      <PageHead title="Availability" sub={staff ? 'Which pilots are free, booked or off each day.' : 'Mark the days you cannot fly. The website updates straight away.'}><Live /></PageHead>
      <Card pad={false}>
        <div className="card-h">
          <div className="row"><button className="btn btn-outline btn-sm" onClick={() => shift(-1)}>←</button><h2 style={{ minWidth: 150, textAlign: 'center' }}>{first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2><button className="btn btn-outline btn-sm" onClick={() => shift(1)}>→</button></div>
          <div className="row small muted"><span className="pill bk" style={{ display: 'inline-block' }}>Booked</span><span className="pill off" style={{ display: 'inline-block' }}>Off</span></div>
        </div>
        <div className="card-b">
          {av.error && <ErrorBox error={av.error} />}
          {av.isLoading ? <Loading /> : (
            <div className="cal">
              {DOW.map((d) => <div key={d} className="dh">{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="d out" />;
                const k = iso(ym.y, ym.m, d); const x = byDay[k];
                return (
                  <div key={k} className={`d ${k === todayStr() ? 'today' : ''}`} onClick={() => setDay(k)}>
                    <div className="n">{d}</div>
                    {x?.booked.length > 0 && <span className="pill bk">{x.booked.length} booked</span>}
                    {x?.off.length > 0 && <span className="pill off">{staff ? `${x.off.length} off` : 'Off'}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {day && (
        <Drawer title={new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} onClose={() => { setDay(null); setPilotPick(''); }}>
          <h3 className="mb">Bookings ({info.booked.length})</h3>
          {info.booked.length === 0 ? <p className="muted">No bookings this day.</p> : info.booked.map((b) => <div key={b._id || b.bookingId} className="row between" style={{ padding: '6px 0' }}><span className="mono">{b.bookingId}</span>{staff && <Badge tone="teal">{code(b.pilotId)}</Badge>}</div>)}
          <h3 className="mb mt">{staff ? `Pilots off (${info.off.length})` : 'Your status'}</h3>
          {info.off.length === 0 && <p className="muted">{staff ? 'Everyone is available.' : 'You are available this day.'}</p>}
          {info.off.map((a) => (
            <div key={a._id} className="row between" style={{ padding: '6px 0' }}>
              <span>{staff ? <b className="mono">{code(a.pilotId)}</b> : 'Marked off'} <span className="muted small">{a.reason}</span></span>
              <button className="btn btn-outline btn-sm" disabled={unmark.isPending} onClick={() => unmark.mutate(a._id)}>Make available</button>
            </div>
          ))}
          {day >= todayStr() && (staff ? (
            <div className="mt">
              <label className="f">Mark a pilot unavailable</label>
              <div className="row">
                <select value={pilotPick} onChange={(e) => setPilotPick(e.target.value)}><option value="">Select pilot</option>{certified.map((p) => <option key={p._id} value={p._id}>{p.code} · {p.level}</option>)}</select>
                <button className="btn btn-primary" disabled={!pilotPick || mark.isPending} onClick={() => mark.mutate({ pilotId: pilotPick, date: day, reason: 'Set by office' })}>Mark off</button>
              </div>
            </div>
          ) : !myOff && (
            <button className="btn btn-primary mt" disabled={mark.isPending} onClick={() => mark.mutate({ date: day, reason: 'Personal' })}>I am not available this day</button>
          ))}
        </Drawer>
      )}
    </>
  );
}
