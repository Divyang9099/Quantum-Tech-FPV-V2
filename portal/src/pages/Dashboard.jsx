import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBox, Kpi, Live, Loading, PageHead, StageBadge, ago, fmtDate } from '../ui';

const COLORS = ['#0E7490', '#06B6D4', '#4D5A1F', '#94A3B8', '#B45309', '#CBD5E1'];
const FUNNEL = ['#0E7490', '#1595B0', '#06B6D4', '#67E8F9'];
const mon = (m) => new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short' });

export default function Dashboard() {
  const { user } = useAuth();
  const s = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard/summary'), refetchInterval: 30000 });
  const st = useQuery({ queryKey: ['booking-stats'], queryFn: () => get('/bookings/stats'), enabled: user.role !== 'pilot' });

  const { rows, types } = useMemo(() => {
    const by = {}; const totals = {};
    (s.data?.monthly || []).forEach((m) => { by[m.month] = { ...(by[m.month] || { month: m.month }), [m.projectType]: m.n }; totals[m.projectType] = (totals[m.projectType] || 0) + m.n; });
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5).map((t) => t[0]);
    const rows = Object.values(by).sort((a, b) => a.month.localeCompare(b.month)).slice(-12).map((r) => {
      const o = { month: mon(r.month), Other: 0 };
      Object.entries(r).forEach(([k, v]) => { if (k === 'month') return; if (top.includes(k)) o[k] = v; else o.Other += v; });
      return o;
    });
    return { rows, types: [...top, 'Other'] };
  }, [s.data]);

  if (s.isLoading) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} />;
  const d = s.data;

  if (d.role === 'pilot') {
    return (
      <>
        <PageHead title={`Hello, ${user.name.split(' ')[0]}`} sub="Your flying schedule at a glance."><Live /></PageHead>
        <div className="grid g4 mb">
          <Kpi label="Flights today" value={d.kpi.today} />
          <Kpi label="Upcoming flights" value={d.kpi.upcoming} />
          <Kpi label="Flight hours" value={d.kpi.hours} />
          <Kpi label="Certificate valid till" value={fmtDate(d.kpi.certValidTill)} />
        </div>
        <Card title="Upcoming bookings" action={<Link to="/bookings">View all</Link>} pad={false}>
          {d.upcoming.length === 0 ? <Empty title="No upcoming flights" /> : (
            <table className="tbl"><thead><tr><th>Booking</th><th>Date</th><th>Slot</th><th>Project</th><th>Location</th><th>Stage</th></tr></thead>
              <tbody>{d.upcoming.map((b) => <tr key={b._id}><td className="mono">{b.bookingId}</td><td>{fmtDate(b.date)}</td><td>{b.slotId?.name}</td><td>{b.projectType}</td><td>{b.location}</td><td><StageBadge stage={b.stage} /></td></tr>)}</tbody></table>
          )}
        </Card>
      </>
    );
  }

  const funnel = st.data?.funnel || [];
  const top = funnel[0]?.n || 1;
  return (
    <>
      <PageHead title="Dashboard" sub="Everything happening across operations right now."><Live /></PageHead>
      <div className="grid g4 mb">
        <Kpi label="Bookings today" value={d.kpi.bookingsToday} flash={d.kpi.bookingsToday} />
        <Kpi label="Active bookings" value={d.kpi.activeBookings} flash={d.kpi.activeBookings} />
        <Kpi label="Pilots free today" value={d.kpi.freePilots} sub="certified and available" />
        <Kpi label="New enquiries" value={d.kpi.newEnquiries} flash={d.kpi.newEnquiries} />
      </div>

      <div className="grid g21 mb">
        <Card title="Bookings by month and project type">
          <div style={{ height: 290 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ left: -18 }}>
                <CartesianGrid vertical={false} stroke="#EEF2F6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {types.map((t, i) => <Bar key={t} dataKey={t} stackId="a" fill={COLORS[i]} radius={i === types.length - 1 ? [3, 3, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Needs attention">
          {d.alerts.map((a) => (
            <Link key={a.key} to={a.link} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', color: 'inherit' }}>
              <span>{a.label}</span><Badge tone={a.n ? { warning: 'warn', danger: 'bad', info: 'info' }[a.tone] : 'gray'}>{a.n}</Badge>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid g2 mb">
        <Card title="Booking pipeline">
          {funnel.map((f, i) => (
            <div key={f.stage} style={{ marginBottom: 14 }}>
              <div className="row between small"><span>{f.stage}</span><b>{f.n}</b></div>
              <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${(f.n / top) * 100}%`, background: FUNNEL[i] }} /></div>
            </div>
          ))}
        </Card>
        <Card title="Received vs completed">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={(st.data?.monthly || []).slice(-12).map((m) => ({ ...m, month: mon(m.month) }))} margin={{ left: -18 }}>
                <CartesianGrid vertical={false} stroke="#EEF2F6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="received" stroke="#0E7490" strokeWidth={2.5} dot={false} name="Received" />
                <Line type="monotone" dataKey="completed" stroke="#06B6D4" strokeWidth={2.5} dot={false} strokeDasharray="5 4" name="Completed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Recent bookings" action={<Link to="/bookings">View all</Link>} pad={false}>
        <table className="tbl"><thead><tr><th>Booking</th><th>Client</th><th>Date</th><th>Slot</th><th>Pilot</th><th>Source</th><th>Stage</th><th>Received</th></tr></thead>
          <tbody>{d.recent.map((b) => (
            <tr key={b._id} className={Date.now() - new Date(b.createdAt) < 60000 ? 'flash' : ''}>
              <td className="mono">{b.bookingId}</td><td>{b.contact?.company || b.contact?.name}</td><td>{fmtDate(b.date)}</td><td>{b.slotId?.name}</td>
              <td className="mono">{b.pilotId?.code}</td><td><Badge tone={b.source === 'website' ? 'teal' : 'gray'}>{b.source}</Badge></td><td><StageBadge stage={b.stage} /></td><td className="muted">{ago(b.createdAt)}</td>
            </tr>
          ))}</tbody></table>
      </Card>
    </>
  );
}
