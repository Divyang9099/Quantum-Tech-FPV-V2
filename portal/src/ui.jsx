import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STAGE_LABEL } from 'shared';

// ---------- Icons (stroke, 24px grid) ----------
const P = {
  dash: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  book: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 14h2M14 14h2M8 18h2',
  pilot: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  mail: 'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM22 6l-10 7L2 6',
  calc: 'M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h8',
  cap: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5',
  batch: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6',
  cert: 'M12 15a6 6 0 100-12 6 6 0 000 12zM8.2 13.9L7 23l5-3 5 3-1.2-9.1',
  drone: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M5 5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M19 5m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M5 19m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M19 19m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3',
  doc: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h8',
  log: 'M12 8v4l3 3M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8M3 3v5h5',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  dl: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
};
export const Icon = ({ n, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={P[n]} /></svg>
);

// ---------- Formatting ----------
export const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const fmtDate = (d) => (d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const ago = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(d);
};

// ---------- Badges ----------
const STAGE_TONE = { booked: 'info', checked_in: 'teal', flight_completed: 'warn', report_delivered: 'ok', cancelled: 'bad' };
export const Badge = ({ tone = 'gray', children }) => <span className={`badge b-${tone}`}>{children}</span>;
export const StageBadge = ({ stage }) => <Badge tone={STAGE_TONE[stage] || 'gray'}>{STAGE_LABEL[stage] || stage}</Badge>;
export const LevelBadge = ({ level }) => <Badge tone="olive">{level}</Badge>;
const TONES = { new: 'info', in_discussion: 'warn', converted: 'ok', closed: 'gray', draft: 'gray', sent: 'info', accepted: 'ok', rejected: 'bad', expired: 'bad', paid: 'ok', unpaid: 'warn', free: 'ok', in_use: 'info', repair: 'bad', active: 'ok', leave: 'warn', pending: 'warn', approved: 'ok', entered: 'gray', verified: 'info', enrolled: 'teal', passed: 'ok', promoted: 'olive', upcoming: 'info', running: 'teal', completed: 'ok', admin: 'olive', office: 'teal', pilot: 'info' };
export const StatusBadge = ({ s }) => <Badge tone={TONES[s] || 'gray'}>{String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</Badge>;

// ---------- Toasts ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, tone = '') => {
    const id = Math.random();
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{list.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}

// ---------- Layout bits ----------
export const PageHead = ({ title, sub, children }) => (
  <div className="pagehead"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="row wrap">{children}</div></div>
);
export const Card = ({ title, action, children, pad = true, style }) => (
  <div className="card" style={style}>
    {title && <div className="card-h"><h2>{title}</h2>{action}</div>}
    {pad ? <div className="card-b">{children}</div> : children}
  </div>
);
export const Kpi = ({ label, value, sub, flash }) => (
  <div className={`card kpi ${flash ? 'pulse-up' : ''}`} key={flash}><small>{label}</small><b>{value}</b>{sub && <div className="sub">{sub}</div>}</div>
);
export const Empty = ({ title = 'Nothing here yet', sub }) => <div className="empty"><b>{title}</b>{sub}</div>;
export const Loading = () => <div style={{ padding: 20 }}><div className="skel" style={{ width: '60%' }} /><div className="skel" /><div className="skel" style={{ width: '80%' }} /></div>;
export const Live = () => <span className="live"><i />Live</span>;
export const ErrorBox = ({ error }) => error ? <div className="alert bad">{error.message}</div> : null;

export function Drawer({ title, onClose, children, footer }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog">
        <div className="drawer-h"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="drawer-b">{children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </aside>
    </>
  );
}
export function Modal({ title, onClose, children, footer }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog">
        <div className="drawer-h"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="drawer-b" style={{ overflow: 'visible' }}>{children}</div>
        {footer && <div className="drawer-f" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </>
  );
}

export const Field = ({ label, error, children }) => (
  <div className="field"><label className="f">{label}</label>{children}{error && <div className="ferr">{error}</div>}</div>
);

export const Pager = ({ page, limit, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span>{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : 'No results'}</span>
      <div className="row gap-sm">
        <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
};

export function useDebounced(v, ms = 300) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}
