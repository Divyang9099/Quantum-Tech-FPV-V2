import { Router } from 'express';
import { z } from 'zod';
import { Availability, Booking, Pilot } from '../models/index.js';
import { auth, rbac } from '../middleware/auth.js';
import { AppError, ok, wrap } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { cancelBooking, changeStage, createBooking, rescheduleBooking } from '../services/booking.js';
import { emit } from '../realtime/io.js';

const r = Router();
r.use(auth);

const scope = (req) => (req.user.role === 'pilot' ? { pilotId: req.user.pilotId } : {});
const POP = [['pilotId', 'code name level'], ['slotId', 'name extra'], ['clientId', 'company contactName']];
const populate = (q) => POP.reduce((acc, [p, s]) => acc.populate(p, s), q);

const TABS = {
  active: { stage: { $in: ['booked', 'checked_in', 'flight_completed'] } },
  completed: { stage: { $in: ['flight_completed', 'report_delivered'] } },
  cancelled: { stage: 'cancelled' },
};

r.get('/', wrap(async (req, res) => {
  const { tab, stage, date, pilot, source, q, page = 1, limit = 15 } = req.query;
  const f = { ...scope(req), ...(TABS[tab] || {}) };
  if (stage) f.stage = stage;
  if (date) f.date = date;
  if (pilot) f.pilotId = pilot;
  if (source) f.source = source;
  if (q) f.$or = [{ bookingId: new RegExp(q, 'i') }, { 'contact.name': new RegExp(q, 'i') }, { 'contact.company': new RegExp(q, 'i') }];
  const total = await Booking.countDocuments(f);
  const rows = await populate(Booking.find(f).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(+limit));
  // Pilots never see client phone/email beyond the site contact for their own bookings.
  ok(res, rows, { total, page: +page, limit: +limit });
}));

r.get('/stats', wrap(async (req, res) => {
  const f = scope(req);
  const stages = await Booking.aggregate([{ $match: f }, { $group: { _id: '$stage', n: { $sum: 1 } } }]);
  const by = Object.fromEntries(stages.map((s) => [s._id, s.n]));
  const received = by.booked + by.checked_in + by.flight_completed + by.report_delivered || 0;
  const reached = (...k) => k.reduce((a, s) => a + (by[s] || 0), 0);
  const funnel = [
    { stage: 'Booked', n: reached('booked', 'checked_in', 'flight_completed', 'report_delivered') },
    { stage: 'Checked in', n: reached('checked_in', 'flight_completed', 'report_delivered') },
    { stage: 'Flight completed', n: reached('flight_completed', 'report_delivered') },
    { stage: 'Report delivered', n: reached('report_delivered') },
  ];
  const monthly = await Booking.aggregate([
    { $match: f },
    { $group: { _id: { $substr: ['$date', 0, 7] }, received: { $sum: 1 }, completed: { $sum: { $cond: [{ $in: ['$stage', ['flight_completed', 'report_delivered']] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const t = new Date().toISOString().slice(0, 10);
  ok(res, {
    funnel, monthly: monthly.map((m) => ({ month: m._id, received: m.received, completed: m.completed })),
    kpi: {
      today: await Booking.countDocuments({ ...f, date: t, stage: { $ne: 'cancelled' } }),
      active: (by.booked || 0) + (by.checked_in || 0) + (by.flight_completed || 0),
      completed: reached('flight_completed', 'report_delivered'), cancelled: by.cancelled || 0, received,
    },
  });
}));

r.get('/:id', wrap(async (req, res) => {
  const b = await populate(Booking.findOne({ bookingId: req.params.id, ...scope(req) }));
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Booking not found.');
  ok(res, b);
}));

// Phone booking (Office, Admin)
r.post('/', rbac('admin', 'office'), wrap(async (req, res) => {
  const b = z.object({
    pilotId: z.string().length(24), slotId: z.string().length(24), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    projectType: z.string().min(2), location: z.string().min(2),
    name: z.string().min(2), company: z.string().optional().default(''),
    phone: z.string().min(10), email: z.string().email(), notes: z.string().optional().default(''),
  }).parse(req.body);
  const { booking } = await createBooking({
    ...b, source: 'phone', contact: { name: b.name, company: b.company, phone: b.phone, email: b.email },
  }, req.user);
  res.status(201).json({ success: true, data: booking });
}));

const load = async (req) => {
  const b = await Booking.findOne({ bookingId: req.params.id, ...scope(req) });
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Booking not found.');
  return b;
};

r.patch('/:id/stage', wrap(async (req, res) => {
  const { stage } = z.object({ stage: z.enum(['checked_in', 'flight_completed', 'report_delivered']) }).parse(req.body);
  ok(res, await changeStage(await load(req), stage, req.user));
}));

r.patch('/:id/cancel', rbac('admin', 'office'), wrap(async (req, res) => {
  const { reason = 'Cancelled by office' } = req.body || {};
  ok(res, await cancelBooking(await load(req), reason, req.user));
}));

r.patch('/:id/reschedule', rbac('admin', 'office'), wrap(async (req, res) => {
  const d = z.object({ date: z.string().optional(), slotId: z.string().optional() }).parse(req.body);
  ok(res, await rescheduleBooking(await load(req), d, req.user));
}));

r.patch('/:id/assign-pilot', rbac('admin', 'office'), wrap(async (req, res) => {
  const { pilotId } = z.object({ pilotId: z.string().length(24) }).parse(req.body);
  if (!(await Pilot.exists({ _id: pilotId, isDeleted: false }))) throw new AppError(400, 'INVALID', 'Pilot not found.');
  ok(res, await rescheduleBooking(await load(req), { pilotId }, req.user));
}));

export default r;

// ---- Availability (pilot days off) ----
export const availability = Router();
availability.use(auth);

availability.get('/', wrap(async (req, res) => {
  const { from, to, pilotId } = req.query;
  const f = {};
  if (from || to) f.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (req.user.role === 'pilot') f.pilotId = req.user.pilotId;
  else if (pilotId) f.pilotId = pilotId;
  const off = await Availability.find(f);
  const bf = { stage: { $ne: 'cancelled' }, ...(f.date && { date: f.date }), ...(f.pilotId && { pilotId: f.pilotId }) };
  const booked = await Booking.find(bf).select('pilotId date slotId bookingId');
  ok(res, { off, booked });
}));

availability.post('/', wrap(async (req, res) => {
  const d = z.object({ pilotId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), type: z.enum(['off', 'leave']).default('off'), reason: z.string().optional() }).parse(req.body);
  const pilotId = req.user.role === 'pilot' ? req.user.pilotId : d.pilotId;
  if (!pilotId) throw new AppError(400, 'VALIDATION', 'Pick a pilot.');
  if (await Booking.exists({ pilotId, date: d.date, stage: { $ne: 'cancelled' } })) {
    throw new AppError(409, 'HAS_BOOKING', 'You have a booking on this day. Please ask Office to reschedule or assign another pilot.');
  }
  const a = await Availability.findOneAndUpdate({ pilotId, date: d.date }, { ...d, pilotId }, { upsert: true, new: true });
  await audit(req.user, 'Day marked unavailable', 'availability', a._id, null, { date: d.date });
  emit(['role:admin', 'role:office', 'public:availability'], 'availability.changed', { date: d.date });
  ok(res, a);
}));

availability.delete('/:id', wrap(async (req, res) => {
  const a = await Availability.findById(req.params.id);
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  if (req.user.role === 'pilot' && String(a.pilotId) !== req.user.pilotId) throw new AppError(403, 'FORBIDDEN', 'Not allowed.');
  await a.deleteOne();
  await audit(req.user, 'Day made available', 'availability', a._id, { date: a.date });
  emit(['role:admin', 'role:office', 'public:availability'], 'availability.changed', { date: a.date });
  ok(res, true);
}));
