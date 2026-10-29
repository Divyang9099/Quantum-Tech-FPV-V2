const BASE = (import.meta.env.VITE_API || 'http://localhost:4000') + '/api/v1';
export const API_ORIGIN = import.meta.env.VITE_API || 'http://localhost:4000';

let token = null;
let onLogout = () => {};
export const setToken = (t) => { token = t; };
export const getToken = () => token;
export const setOnLogout = (fn) => { onLogout = fn; };

export class ApiError extends Error {
  constructor(m, code, status, details) { super(m); this.code = code; this.status = status; this.details = details; }
}

async function raw(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts, credentials: 'include',
    headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  return res;
}

export async function refresh() {
  const res = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  const j = await res.json();
  token = j.data.token;
  return j.data;
}

export async function api(path, opts) {
  let res;
  try { res = await raw(path, opts); } catch { throw new ApiError('Cannot reach the server. Is the API running?', 'NETWORK', 0); }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refresh()) res = await raw(path, opts);
    else { onLogout(); throw new ApiError('Please log in again.', 'UNAUTHORIZED', 401); }
  }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return res.ok ? res : Promise.reject(new ApiError('Request failed.', 'ERR', res.status));
  const j = await res.json();
  if (!res.ok || j.success === false) throw new ApiError(j.message || 'Something went wrong.', j.code, res.status, j.details);
  return j;
}

// Returns just `data`; use apiFull for `data` plus meta (total, counts, stats...).
export const get = async (p) => (await api(p)).data;
export const full = (p) => api(p);
export const post = async (p, body) => (await api(p, { method: 'POST', body: body ?? {} })).data;
export const patch = async (p, body) => (await api(p, { method: 'PATCH', body: body ?? {} })).data;
export const put = async (p, body) => (await api(p, { method: 'PUT', body })).data;
export const del = async (p) => (await api(p, { method: 'DELETE' })).data;

// Authenticated file download (PDF / Excel).
export async function download(path, filename) {
  const res = await raw(path);
  if (!res.ok) throw new ApiError('Could not download the file.', 'ERR', res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== '' && v != null && v !== 'all' && p.set(k, v));
  const s = p.toString();
  return s ? '?' + s : '';
};
