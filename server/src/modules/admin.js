import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  AuditLog, Availability, Booking, Certificate, Client, Document, Drone, Enquiry, Estimate, Master, Notification, Pilot, User,
} from '../models/index.js';
import { auth, rbac } from '../middleware/auth.js';
import { AppError, ok, wrap } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { getRates, getSetting, setSetting } from '../services/settings.js';

const A = rbac('admin');
const AO = rbac('admin', 'office');

// ---------------- Dashboard (role aware) ----------------
export const dashboard = Router();
dashboard.use(auth);

dashboard.get('/summary', wrap(async (req, res) => {
  const t = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 864e5);

  if (req.user.role === 'pilot') {
    const own = { pilotId: req.user.pilotId };
    const p = await Pilot.findById(req.user.pilotId);
    const cert = await Certificate.findOne({ pilotId: p._id, status: 'approved' }).sort({ expiryDate: -1 });
    return ok(res, {
      role: 'pilot',
      kpi: {
        today: await Booking.countDocuments({ ...own, date: t, stage: { $ne: 'cancelled' } }),
        upcoming: await Booking.countDocuments({ ...own, date: { $gt: t }, stage: 'booked' }),
        hours: p.flightHours, certValidTill: cert?.expiryDate,
      },
      upcoming: await Booking.find({ ...own, date: { $gte: t }, stage: { $ne: 'cancelled' } }).sort({ date: 1 }).limit(8).populate('slotId', 'name'),
    });
  }

  const offToday = (await Availability.find({ date: t }).select('pilotId')).map((a) => String(a.pilotId));
  const certified = await Certificate.find({ status: 'approved', expiryDate: { $gte: new Date() } }).select('pilotId');
  const freePilots = certified.filter((c) => !offToday.includes(String(c.pilotId))).length;

  const monthly = await Booking.aggregate([
    { $match: { stage: { $ne: 'cancelled' } } },
    { $group: { _id: { m: { $substr: ['$date', 0, 7] }, p: '$projectType' }, n: { $sum: 1 } } },
  ]);
  const alerts = [
    { key: 'docs', label: 'Documents expiring in 30 days', n: await Document.countDocuments({ expiryDate: { $gte: new Date(), $lte: soon } }), link: '/documents', tone: 'warning' },
    { key: 'certs', label: 'Certificates expiring in 30 days', n: await Certificate.countDocuments({ status: 'approved', expiryDate: { $gte: new Date(), $lte: soon } }), link: '/pilots', tone: 'warning' },
    { key: 'enq', label: 'Unanswered enquiries', n: await Enquiry.countDocuments({ status: 'new' }), link: '/enquiries', tone: 'info' },
    { key: 'drone', label: 'Drones with service due', n: await Drone.countDocuments({ serviceDueDate: { $lte: soon } }), link: '/fleet', tone: 'danger' },
  ];
  ok(res, {
    role: req.user.role,
    kpi: {
      bookingsToday: await Booking.countDocuments({ date: t, stage: { $ne: 'cancelled' } }),
      activeBookings: await Booking.countDocuments({ stage: { $in: ['booked', 'checked_in', 'flight_completed'] } }),
      freePilots, newEnquiries: await Enquiry.countDocuments({ status: 'new' }),
    },
    monthly: monthly.map((m) => ({ month: m._id.m, projectType: m._id.p, n: m.n })),
    alerts, recent: await Booking.find().sort({ createdAt: -1 }).limit(6).populate('pilotId', 'code').populate('slotId', 'name'),
  });
}));

// ---------------- Masters ----------------
export const masters = Router();
masters.use(auth);
masters.get('/:kind', wrap(async (req, res) => ok(res, await Master.find({ kind: req.params.kind }).sort({ order: 1, name: 1 }))));
masters.post('/:kind', A, wrap(async (req, res) => {
  const m = await Master.create({ ...req.body, kind: req.params.kind });
  await audit(req.user, 'Master added', 'masters', m._id, null, { kind: m.kind, name: m.name });
  res.status(201).json({ success: true, data: m });
}));
masters.patch('/:kind/:id', A, wrap(async (req, res) => {
  const m = await Master.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await audit(req.user, 'Master updated', 'masters', m._id, null, req.body);
  ok(res, m);
}));
masters.delete('/:kind/:id', A, wrap(async (req, res) => { await Master.findByIdAndDelete(req.params.id); ok(res, true); }));

// ---------------- Settings ----------------
export const settings = Router();
settings.use(auth);
settings.get('/rate-library', AO, wrap(async (req, res) => {
  const r = await getRates();
  if (req.user.role === 'office') { delete r.marginPct; delete r.overheadPct; delete r.contingencyPct; }
  ok(res, r);
}));
settings.put('/rate-library', A, wrap(async (req, res) => {
  await setSetting('rateLibrary', req.body);
  await audit(req.user, 'Rate library updated', 'settings', 'rateLibrary');
  ok(res, await getRates());
}));
settings.get('/website', wrap(async (_req, res) => ok(res, { showPilotNames: await getSetting('showPilotNames', false) })));
settings.put('/website', A, wrap(async (req, res) => {
  await setSetting('showPilotNames', !!req.body.showPilotNames);
  await audit(req.user, 'Website setting changed', 'settings', 'showPilotNames', null, { showPilotNames: !!req.body.showPilotNames });
  ok(res, { showPilotNames: !!req.body.showPilotNames });
}));

// ---------------- Users ----------------
export const users = Router();
users.use(auth, A);
users.get('/', wrap(async (_req, res) => ok(res, await User.find().select('-passwordHash').sort({ role: 1, name: 1 }))));
users.post('/', wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['admin', 'office']), password: z.string().min(6) }).parse(req.body);
  const u = await User.create({ name: d.name, email: d.email, role: d.role, passwordHash: await bcrypt.hash(d.password, 8) });
  await audit(req.user, 'User created', 'users', u.email);
  res.status(201).json({ success: true, data: { id: u._id, name: u.name, email: u.email, role: u.role } });
}));
users.patch('/:id/status', wrap(async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { isActive: !!req.body.isActive }, { new: true }).select('-passwordHash');
  await audit(req.user, `User ${u.isActive ? 'enabled' : 'disabled'}`, 'users', u.email);
  ok(res, u);
}));

// ---------------- Audit log (Admin, read only: no write routes exist) ----------------
export const auditLogs = Router();
auditLogs.use(auth, A);
auditLogs.get('/', wrap(async (req, res) => {
  const { module, user, from, to, page = 1, limit = 25 } = req.query;
  const f = {};
  if (module) f.module = module;
  if (user) f.userName = new RegExp(user, 'i');
  if (from || to) f.timestamp = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(`${to}T23:59:59`) }) };
  ok(res, await AuditLog.find(f).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(+limit), { total: await AuditLog.countDocuments(f), page: +page });
}));

// ---------------- Notifications ----------------
export const notifications = Router();
notifications.use(auth);
notifications.get('/', wrap(async (req, res) => {
  const f = { $or: [{ role: req.user.role }, { userId: req.user.id }] };
  ok(res, await Notification.find(f).sort({ createdAt: -1 }).limit(20), { unread: await Notification.countDocuments({ ...f, read: false }) });
}));
notifications.post('/read-all', wrap(async (req, res) => {
  await Notification.updateMany({ $or: [{ role: req.user.role }, { userId: req.user.id }] }, { read: true });
  ok(res, true);
}));

// ---------------- Fleet ----------------
export const fleet = Router();
fleet.use(auth);
fleet.get('/', wrap(async (req, res) => {
  const drones = await Drone.find().sort({ code: 1 });
  const by = (s) => drones.filter((d) => d.status === s).length;
  ok(res, drones, { stats: { free: by('free'), in_use: by('in_use'), repair: by('repair'), serviceDue: drones.filter((d) => d.serviceDueDate && d.serviceDueDate <= new Date(Date.now() + 30 * 864e5)).length } });
}));
fleet.post('/', A, wrap(async (req, res) => { const d = await Drone.create(req.body); await audit(req.user, 'Drone added', 'fleet', d.code); res.status(201).json({ success: true, data: d }); }));
fleet.patch('/:id/status', AO, wrap(async (req, res) => {
  const d = await Drone.findByIdAndUpdate(req.params.id, { status: z.enum(['free', 'in_use', 'repair']).parse(req.body.status) }, { new: true });
  await audit(req.user, `Drone ${d.code} set to ${d.status}`, 'fleet', d.code);
  ok(res, d);
}));
fleet.post('/:id/problem', rbac('pilot'), wrap(async (req, res) => {
  const d = await Drone.findById(req.params.id);
  await audit(req.user, `Problem reported on ${d.code}: ${req.body.note || ''}`, 'fleet', d.code);
  ok(res, true);
}));
fleet.delete('/:id', A, wrap(async (req, res) => { await Drone.findByIdAndDelete(req.params.id); ok(res, true); }));

// ---------------- Documents ----------------
export const documents = Router();
documents.use(auth);
documents.get('/expiring', AO, wrap(async (req, res) => ok(res, await Document.find({ expiryDate: { $lte: new Date(Date.now() + (req.query.days || 30) * 864e5) } }).sort({ expiryDate: 1 }))));
documents.get('/', wrap(async (req, res) => {
  if (req.user.role === 'pilot') {
    const mine = await Booking.find({ pilotId: req.user.pilotId }).select('bookingId');
    return ok(res, await Document.find({ 'linkedTo.kind': 'booking', 'linkedTo.id': { $in: mine.map((b) => b.bookingId) } }));
  }
  const all = await Document.find().sort({ expiryDate: 1 });
  const now = new Date(); const soon = new Date(Date.now() + 30 * 864e5);
  ok(res, all, { stats: { total: all.length, expiring: all.filter((d) => d.expiryDate >= now && d.expiryDate <= soon).length, expired: all.filter((d) => d.expiryDate < now).length } });
}));
documents.post('/', A, wrap(async (req, res) => { const d = await Document.create({ ...req.body, uploadedBy: req.user.id }); await audit(req.user, 'Document uploaded', 'documents', d.title); res.status(201).json({ success: true, data: d }); }));
documents.delete('/:id', A, wrap(async (req, res) => { await Document.findByIdAndDelete(req.params.id); await audit(req.user, 'Document deleted', 'documents', req.params.id); ok(res, true); }));

void Client; void Estimate; void AppError;
