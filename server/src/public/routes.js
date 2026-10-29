import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Booking, Certificate, Enquiry, Master, Setting } from '../models/index.js';
import { apiKey } from '../middleware/auth.js';
import { AppError, ok, wrap } from '../utils/errors.js';
import { nextCode } from '../utils/ids.js';
import { bookablePilots, createBooking } from '../services/booking.js';
import { notify } from '../services/notification.js';
import { audit } from '../services/audit.js';
import { STAGE_LABEL } from 'shared';

const r = Router();
r.use(apiKey);

const writeLimit = rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMIT', message: 'Too many requests. Please wait a minute.' },
});

const phone = z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const bookingSchema = z.object({
  pilotId: z.string().length(24), slotId: z.string().length(24),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectType: z.string().trim().min(2).max(60), location: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(80), company: z.string().trim().max(120).optional().default(''),
  phone, email: z.string().trim().email().max(120), notes: z.string().trim().max(1000).optional().default(''),
});
const enquirySchema = z.object({
  name: z.string().trim().min(2).max(80), company: z.string().trim().max(120).optional().default(''),
  phone, email: z.string().trim().email().max(120), details: z.string().trim().min(10).max(3000),
});

const lists = async () => {
  const ms = await Master.find({ isActive: true, kind: { $in: ['projectType', 'city', 'slot'] } }).sort({ order: 1, name: 1 });
  const pick = (k) => ms.filter((m) => m.kind === k).map((m) => ({ id: m._id, name: m.name, extra: m.extra }));
  return { projectTypes: pick('projectType'), cities: pick('city'), slots: pick('slot') };
};

// 1. List pilots: code, level, skills, base city only. Never names or phone numbers.
r.get('/pilots', wrap(async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const pilots = await bookablePilots(date, { city: req.query.city });
  const showNames = (await Setting.findOne({ key: 'showPilotNames' }))?.value === true;
  ok(res, {
    pilots: pilots.map((p) => ({ id: p._id, code: p.code, level: p.level, skills: p.skills, baseCity: p.baseCity, ...(showNames && { name: p.name }) })),
    ...(await lists()),
  });
}));

// 2. Availability for a date: each pilot's slots free or booked.
r.get('/availability', wrap(async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  const slots = await Master.find({ kind: 'slot', isActive: true }).sort({ order: 1 });
  const pilots = await bookablePilots(date, { city: req.query.city });
  const taken = await Booking.find({ date, stage: { $ne: 'cancelled' }, pilotId: { $in: pilots.map((p) => p._id) } }).select('pilotId slotId');
  const key = new Set(taken.map((b) => `${b.pilotId}:${b.slotId}`));
  const showNames = (await Setting.findOne({ key: 'showPilotNames' }))?.value === true;
  ok(res, {
    date,
    slots: slots.map((s) => ({ id: s._id, name: s.name, startTime: s.extra?.startTime, endTime: s.extra?.endTime })),
    pilots: pilots.map((p) => ({
      id: p._id, code: p.code, level: p.level, skills: p.skills, baseCity: p.baseCity, ...(showNames && { name: p.name }),
      slots: slots.map((s) => ({ slotId: s._id, status: key.has(`${p._id}:${s._id}`) ? 'booked' : 'free' })),
    })),
  });
}));

// 3. Create booking: confirmed instantly.
r.post('/bookings', writeLimit, wrap(async (req, res) => {
  const b = bookingSchema.parse(req.body);
  const { booking } = await createBooking({
    pilotId: b.pilotId, slotId: b.slotId, date: b.date, projectType: b.projectType, location: b.location,
    notes: b.notes, source: 'website', contact: { name: b.name, company: b.company, phone: b.phone, email: b.email },
  }, null);
  res.status(201).json({ success: true, data: { bookingId: booking.bookingId, token: booking.trackingToken } });
}));

// 4. Track: needs both the ID and the token. Client sees stage, date, slot, pilot code, project only.
r.get('/bookings/:id', wrap(async (req, res) => {
  const b = await Booking.findOne({ bookingId: req.params.id, trackingToken: String(req.query.token || '') })
    .populate('pilotId', 'code').populate('slotId', 'name extra');
  if (!b) throw new AppError(404, 'NOT_FOUND', 'We could not find a booking with those details.');
  ok(res, {
    bookingId: b.bookingId, stage: b.stage, stageLabel: STAGE_LABEL[b.stage], date: b.date,
    slot: b.slotId?.name, pilotCode: b.pilotId?.code, projectType: b.projectType,
    history: b.stageHistory.map((h) => ({ stage: h.stage, at: h.at })),
  });
}));

// 5. Custom request.
r.post('/enquiries', writeLimit, wrap(async (req, res) => {
  const d = enquirySchema.parse(req.body);
  const enquiry = await Enquiry.create({ ...d, refNo: await nextCode('enquiry', 'ENQ-', 4) });
  await audit(null, 'Enquiry created from website', 'enquiries', enquiry.refNo);
  await notify('enquiry.created', { enquiry });
  res.status(201).json({ success: true, data: { refNo: enquiry.refNo } });
}));

// Extra call (needs Nihal's OK): certificate QR verification.
r.get('/certificates/verify/:qrToken', wrap(async (req, res) => {
  const c = await Certificate.findOne({ qrToken: req.params.qrToken, status: 'approved' });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
  ok(res, {
    holderName: c.holderName, level: c.level, certNo: c.certNo, issueDate: c.issueDate,
    expiryDate: c.expiryDate, valid: c.expiryDate >= new Date(),
  });
}));

export default r;
