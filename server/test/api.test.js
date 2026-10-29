import test from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API || 'http://localhost:4000';
const H = { 'x-api-key': process.env.PUBLIC_API_KEY || 'qt_demo_public_key_123', 'content-type': 'application/json' };
const get = (p, h = H) => fetch(API + p, { headers: h }).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, b, h = H) => fetch(API + p, { method: 'POST', headers: h, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const login = async (email, password) => (await post('/api/v1/auth/login', { email, password }, { 'content-type': 'application/json' })).body.data;

const futureDate = () => new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
const person = (i) => ({ name: `Test Client ${i}`, company: 'Test Co', phone: '9876543210', email: `t${i}@example.com`, notes: '' });

test('20 simultaneous bookings for one slot -> exactly 1 succeeds', async () => {
  const date = futureDate();
  const { body } = await get(`/public/availability?date=${date}`);
  const pilot = body.data.pilots[0]; const slot = body.data.slots[0];
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    post('/public/bookings', { pilotId: pilot.id, slotId: slot.id, date, projectType: 'Survey', location: 'Pune', ...person(i) })));
  const wins = res.filter((r) => r.status === 201);
  const taken = res.filter((r) => r.status === 409 && r.body.code === 'SLOT_TAKEN');
  assert.equal(wins.length, 1, `expected 1 success, got ${wins.length}`);
  assert.equal(taken.length, 19);
  // cancel as office so the test is repeatable, then the slot is free again
  const office = await login('office@quantumtechfpv.com', 'Office@123');
  const auth = { authorization: `Bearer ${office.token}`, 'content-type': 'application/json' };
  const id = wins[0].body.data.bookingId;
  const c = await fetch(`${API}/api/v1/bookings/${id}/cancel`, { method: 'PATCH', headers: auth, body: '{}' });
  assert.equal(c.status, 200);
  const again = await post('/public/bookings', { pilotId: pilot.id, slotId: slot.id, date, projectType: 'Survey', location: 'Pune', ...person(99) });
  assert.equal(again.status, 201, 'cancelled slot must be bookable again');
  await fetch(`${API}/api/v1/bookings/${again.body.data.bookingId}/cancel`, { method: 'PATCH', headers: auth, body: '{}' });
});

test('public API hides names/phones and rejects a bad key', async () => {
  const { body } = await get('/public/pilots');
  assert.ok(body.data.pilots.length > 0);
  for (const p of body.data.pilots) { assert.equal(p.name, undefined); assert.equal(p.phone, undefined); }
  assert.ok(!body.data.pilots.some((p) => p.code === 'P-016'), 'pilot with expired certificate must not be bookable');
  const bad = await get('/public/pilots', { 'x-api-key': 'nope' });
  assert.equal(bad.status, 401);
});

test('tracking needs both booking id and token', async () => {
  const date = futureDate();
  const { body } = await get(`/public/availability?date=${date}`);
  const pilot = body.data.pilots[1]; const slot = body.data.slots[1];
  const b = await post('/public/bookings', { pilotId: pilot.id, slotId: slot.id, date, projectType: 'Mapping', location: 'Pune', ...person(1) });
  const { bookingId, token } = b.body.data;
  assert.equal((await get(`/public/bookings/${bookingId}?token=wrong`)).status, 404);
  const ok = await get(`/public/bookings/${bookingId}?token=${token}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.body.data).sort(), ['bookingId', 'date', 'history', 'pilotCode', 'projectType', 'slot', 'stage', 'stageLabel'].sort());
  const office = await login('office@quantumtechfpv.com', 'Office@123');
  await fetch(`${API}/api/v1/bookings/${bookingId}/cancel`, { method: 'PATCH', headers: { authorization: `Bearer ${office.token}`, 'content-type': 'application/json' }, body: '{}' });
});

test('RBAC: pilot cannot read clients or cancel; office cannot see margin', async () => {
  const pilot = await login('pilot1@quantumtechfpv.com', 'Pilot@123');
  const ph = { authorization: `Bearer ${pilot.token}` };
  assert.equal((await fetch(`${API}/api/v1/clients`, { headers: ph })).status, 403);
  assert.equal((await fetch(`${API}/api/v1/estimates`, { headers: ph })).status, 403);
  const office = await login('office@quantumtechfpv.com', 'Office@123');
  const list = await (await fetch(`${API}/api/v1/estimates`, { headers: { authorization: `Bearer ${office.token}` } })).json();
  assert.equal(list.data[0].totals.margin, undefined);
  assert.equal(list.data[0].inputs.marginPct, undefined);
  const admin = await login('admin@quantumtechfpv.com', 'Admin@123');
  const a = await (await fetch(`${API}/api/v1/estimates`, { headers: { authorization: `Bearer ${admin.token}` } })).json();
  assert.ok(a.data[0].totals.margin > 0);
});
