import { useState } from 'react';
import { useAuth } from '../auth';

const DEMO = [
  { label: 'Admin', sub: 'Nihal', email: 'admin@quantumtechfpv.com', pw: 'Admin@123' },
  { label: 'Office', sub: 'Riya', email: 'office@quantumtechfpv.com', pw: 'Office@123' },
  { label: 'Pilot', sub: 'QT-P001', email: 'pilot1@quantumtechfpv.com', pw: 'Pilot@123' },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e, p) => {
    setBusy(true); setErr('');
    try { await login(e, p); } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="login">
      <div className="l">
        <img src="/logo.png" alt="Quantum Tech FPV" />
        <div>
          <h1>One place to run every flight, booking and certificate.</h1>
          <p>Live bookings from the website, pilot availability, estimates, training and compliance, all in one operations portal.</p>
        </div>
        <small style={{ color: '#A5F3FC' }}>Quantum Tech FPV · Pune</small>
      </div>
      <div className="r">
        <form onSubmit={(e) => { e.preventDefault(); go(email, pw); }}>
          <h1 style={{ marginBottom: 6 }}>Sign in</h1>
          <p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>Use your work email to continue.</p>
          {err && <div className="alert bad">{err}</div>}
          <div className="field"><label className="f" htmlFor="em">Email</label><input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
          <div className="field"><label className="f" htmlFor="pw">Password</label><input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="muted small" style={{ margin: '26px 0 4px' }}>Demo access, one click:</div>
          <div className="quick">
            {DEMO.map((d) => <button type="button" key={d.label} disabled={busy} onClick={() => go(d.email, d.pw)}>{d.label}<small>{d.sub}</small></button>)}
          </div>
        </form>
      </div>
    </div>
  );
}
