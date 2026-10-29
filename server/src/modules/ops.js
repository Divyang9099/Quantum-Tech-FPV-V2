import { Router } from 'express';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { calculateEstimate, inr } from 'shared';
import { Booking, Certificate, Client, Enquiry, Estimate, Pilot, User } from '../models/index.js';
import { auth, rbac } from '../middleware/auth.js';
import { AppError, ok, wrap } from '../utils/errors.js';
import { nextCode } from '../utils/ids.js';
import { audit } from '../services/audit.js';
import { createBooking } from '../services/booking.js';
import { getRates } from '../services/settings.js';

const AO = rbac('admin', 'office');

// ---------------- Pilots ----------------
export const pilots = Router();
pilots.use(auth);

pilots.get('/me', rbac('pilot'), wrap(async (req, res) => {
  const p = await Pilot.findById(req.user.pilotId);
  const cert = await Certificate.findOne({ pilotId: p._id, status: 'approved' }).sort({ expiryDate: -1 });
  ok(res, { pilot: p, certificate: cert });
}));

pilots.get('/', AO, wrap(async (_req, res) => {
  const list = await Pilot.find({ isDeleted: false }).sort({ code: 1 }).lean();
  const certs = await Certificate.find({ status: 'approved' }).lean();
  const byPilot = Object.fromEntries(certs.map((c) => [String(c.pilotId), c]));
  ok(res, list.map((p) => ({ ...p, certExpiry: byPilot[String(p._id)]?.expiryDate, certId: byPilot[String(p._id)]?._id })));
}));

pilots.get('/stats', AO, wrap(async (_req, res) => {
  const byLevel = await Pilot.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$level', n: { $sum: 1 } } }]);
  const hours = await Booking.aggregate([
    { $match: { stage: { $in: ['flight_completed', 'report_delivered'] } } },
    { $lookup: { from: 'pilots', localField: 'pilotId', foreignField: '_id', as: 'p' } }, { $unwind: '$p' },
    { $group: { _id: { m: { $substr: ['$date', 0, 7] }, level: '$p.level' }, h: { $sum: '$flightHours' } } },
  ]);
  ok(res, { byLevel: byLevel.map((l) => ({ level: l._id, n: l.n })), hours: hours.map((h) => ({ month: h._id.m, level: h._id.level, hours: h.h })) });
}));

pilots.get('/:id', AO, wrap(async (req, res) => {
  const p = await Pilot.findById(req.params.id);
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Pilot not found.');
  const bookings = await Booking.find({ pilotId: p._id }).sort({ date: -1 }).limit(20).populate('slotId', 'name');
  ok(res, { pilot: p, bookings, certificate: await Certificate.findOne({ pilotId: p._id }).sort({ expiryDate: -1 }) });
}));

pilots.post('/', rbac('admin'), wrap(async (req, res) => {
  const d = z.object({
    name: z.string().min(2), phone: z.string().min(10), email: z.string().email(), level: z.string(),
    baseCity: z.string(), skills: z.array(z.string()).default([]),
  }).parse(req.body);
  const code = await nextCode('pilot', 'P-');
  const p = await Pilot.create({ ...d, code, source: 'manual' });
  const u = await User.create({ name: d.name, email: d.email, role: 'pilot', pilotId: p._id, passwordHash: await bcrypt.hash('Pilot@123', 8) });
  p.userId = u._id;
  await p.save();
  const issue = new Date();
  await Certificate.create({
    pilotId: p._id, holderName: p.name, level: p.level, certNo: `QTF-${code}`, status: 'approved',
    issueDate: issue, expiryDate: new Date(issue.getTime() + 365 * 864e5), qrToken: (await import('../utils/ids.js')).newToken(),
  });
  await audit(req.user, 'Pilot added manually', 'pilots', code, null, { name: d.name });
  res.status(201).json({ success: true, data: p });
}));

pilots.patch('/:id', AO, wrap(async (req, res) => {
  const before = await Pilot.findById(req.params.id);
  const p = await Pilot.findByIdAndUpdate(req.params.id, z.object({ name: z.string(), phone: z.string(), baseCity: z.string(), skills: z.array(z.string()), level: z.string() }).partial().parse(req.body), { new: true });
  await audit(req.user, 'Pilot updated', 'pilots', p.code, { name: before.name }, { name: p.name });
  ok(res, p);
}));

// ---------------- Clients ----------------
export const clients = Router();
clients.use(auth, AO);

clients.get('/', wrap(async (req, res) => {
  const q = req.query.q ? { $or: [{ company: new RegExp(req.query.q, 'i') }, { contactName: new RegExp(req.query.q, 'i') }] } : {};
  ok(res, await Client.find(q).sort({ createdAt: -1 }).limit(200));
}));

clients.get('/stats', wrap(async (_req, res) => {
  const all = await Client.find().select('bookingCount createdAt');
  const repeat = all.filter((c) => c.bookingCount > 1).length;
  const monthly = {};
  all.forEach((c) => { const m = c.createdAt.toISOString().slice(0, 7); monthly[m] = (monthly[m] || 0) + 1; });
  const thisMonth = new Date().toISOString().slice(0, 7);
  ok(res, {
    total: all.length, repeat, newClients: all.length - repeat, repeatPct: all.length ? Math.round((repeat / all.length) * 100) : 0,
    newThisMonth: monthly[thisMonth] || 0, monthly: Object.entries(monthly).sort().map(([month, n]) => ({ month, n })),
  });
}));

clients.get('/:id', wrap(async (req, res) => {
  const c = await Client.findById(req.params.id);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  ok(res, { client: c, bookings: await Booking.find({ clientId: c._id }).sort({ date: -1 }).populate('pilotId', 'code').populate('slotId', 'name') });
}));

clients.patch('/:id', wrap(async (req, res) => {
  const c = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
  await audit(req.user, 'Client updated', 'clients', c._id);
  ok(res, c);
}));

// ---------------- Enquiries ----------------
export const enquiries = Router();
enquiries.use(auth, AO);

enquiries.get('/', wrap(async (req, res) => {
  const f = req.query.status ? { status: req.query.status } : {};
  const counts = await Enquiry.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  ok(res, await Enquiry.find(f).sort({ createdAt: -1 }), { counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
}));

enquiries.patch('/:id/status', wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['new', 'in_discussion', 'converted', 'closed']) }).parse(req.body);
  const e = await Enquiry.findByIdAndUpdate(req.params.id, { status }, { new: true });
  await audit(req.user, `Enquiry marked ${status}`, 'enquiries', e.refNo);
  ok(res, e);
}));

enquiries.post('/:id/convert-to-estimate', wrap(async (req, res) => {
  const e = await Enquiry.findById(req.params.id);
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Enquiry not found.');
  const rates = await getRates();
  const est = await Estimate.create({
    estimateNo: await nextCode('estimate', 'EST-', 4), enquiryId: e._id, scenarioName: 'Base', clientName: e.company || e.name,
    projectType: 'Survey', validUntil: new Date(Date.now() + 15 * 864e5),
    inputs: { flightDays: 1, postDays: 1, teamSize: 2, pilots: 1, pilotRate: rates.pilotRates?.['Level 2'] || 0, drones: 1, droneRate: Object.values(rates.droneRates || {})[0] || 0, ratePerKm: rates.ratePerKm, foodPerDay: rates.food, hotelRate: rates.hotel, reportRate: rates.reportRate, overheadPct: rates.overheadPct, contingencyPct: rates.contingencyPct, marginPct: rates.marginPct, taxPct: rates.taxPct },
  });
  est.totals = calculateEstimate(est.inputs);
  await est.save();
  e.status = 'in_discussion';
  e.convertedTo = est.estimateNo;
  await e.save();
  await audit(req.user, 'Enquiry converted to estimate', 'enquiries', e.refNo, null, { estimate: est.estimateNo });
  res.status(201).json({ success: true, data: est });
}));

// ---------------- Estimates ----------------
export const estimates = Router();
estimates.use(auth, AO);

// Office never sees margin/overhead/contingency values.
const redact = (est, role) => {
  const o = est.toObject ? est.toObject() : est;
  if (role === 'office') {
    delete o.totals?.margin; delete o.totals?.overhead; delete o.totals?.contingency;
    for (const k of ['overheadPct', 'contingencyPct', 'marginPct']) if (o.inputs) delete o.inputs[k];
  }
  return o;
};

estimates.post('/calculate', wrap(async (req, res) => {
  const t = calculateEstimate(await lockCommercials(req.body, req.user.role, req.body.id));
  // Office sees direct costs, GST and the grand total, never the margin / overhead / contingency values.
  if (req.user.role === 'office') { delete t.margin; delete t.overhead; delete t.contingency; delete t.subtotal; delete t.beforeGst; }
  ok(res, t);
}));

// Office cannot change overhead / contingency / margin: they are forced back to the saved or default values.
async function lockCommercials(inputs, role, id) {
  if (role !== 'office') return inputs;
  const saved = id ? (await Estimate.findById(id))?.inputs : null;
  const rates = await getRates();
  const src = saved || { overheadPct: rates.overheadPct, contingencyPct: rates.contingencyPct, marginPct: rates.marginPct };
  return { ...inputs, overheadPct: src.overheadPct, contingencyPct: src.contingencyPct, marginPct: src.marginPct };
}

estimates.get('/', wrap(async (req, res) => {
  const f = req.query.status ? { status: req.query.status } : {};
  ok(res, (await Estimate.find(f).sort({ createdAt: -1 })).map((e) => redact(e, req.user.role)));
}));

estimates.get('/stats', wrap(async (_req, res) => {
  const all = await Estimate.find().select('status totals createdAt');
  const count = (s) => all.filter((e) => e.status === s).length;
  const som = new Date(); som.setDate(1);
  const sentThisMonth = all.filter((e) => ['sent', 'accepted', 'rejected', 'expired'].includes(e.status) && e.createdAt >= som).length;
  const decided = count('accepted') + count('rejected');
  const enq = await Enquiry.countDocuments();
  const sentAll = all.filter((e) => e.status !== 'draft').length;
  ok(res, {
    byStatus: ['draft', 'sent', 'accepted', 'rejected', 'expired'].map((s) => ({ status: s, n: count(s) })),
    sentThisMonth, acceptancePct: decided ? Math.round((count('accepted') / decided) * 100) : 0,
    pipeline: all.filter((e) => e.status === 'sent').reduce((a, e) => a + (e.totals?.grand || 0), 0),
    funnel: [{ stage: 'Enquiry', n: enq }, { stage: 'Estimate sent', n: sentAll }, { stage: 'Accepted', n: count('accepted') }, { stage: 'Booking created', n: await Booking.countDocuments({ source: 'estimate' }) }],
  });
}));

estimates.get('/:id', wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Estimate not found.');
  ok(res, redact(e, req.user.role));
}));

estimates.post('/', wrap(async (req, res) => {
  const rates = await getRates();
  const inputs = await lockCommercials({ overheadPct: rates.overheadPct, contingencyPct: rates.contingencyPct, marginPct: rates.marginPct, taxPct: rates.taxPct, ...req.body.inputs }, req.user.role);
  const e = await Estimate.create({
    estimateNo: await nextCode('estimate', 'EST-', 4), scenarioName: req.body.scenarioName || 'Base', clientName: req.body.clientName,
    projectType: req.body.projectType, enquiryId: req.body.enquiryId, validUntil: req.body.validUntil || new Date(Date.now() + 15 * 864e5),
    inputs, totals: calculateEstimate(inputs),
  });
  await audit(req.user, 'Estimate created', 'estimates', e.estimateNo);
  res.status(201).json({ success: true, data: redact(e, req.user.role) });
}));

estimates.patch('/:id', wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  if (e.status !== 'draft') throw new AppError(400, 'LOCKED', 'Only draft estimates can be edited. Duplicate it to make changes.');
  const inputs = await lockCommercials({ ...e.inputs, ...req.body.inputs }, req.user.role, e._id);
  const before = e.totals?.grand;
  Object.assign(e, { scenarioName: req.body.scenarioName ?? e.scenarioName, clientName: req.body.clientName ?? e.clientName, projectType: req.body.projectType ?? e.projectType, validUntil: req.body.validUntil ?? e.validUntil });
  e.inputs = inputs;
  e.totals = calculateEstimate(inputs); // always recalculated on the server
  e.version += 1;
  e.markModified('inputs'); e.markModified('totals');
  await e.save();
  await audit(req.user, 'Estimate updated', 'estimates', e.estimateNo, { grand: before }, { grand: e.totals.grand });
  ok(res, redact(e, req.user.role));
}));

estimates.post('/:id/duplicate', wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  const d = await Estimate.create({ ...e.toObject(), _id: undefined, createdAt: undefined, updatedAt: undefined, estimateNo: await nextCode('estimate', 'EST-', 4), scenarioName: `${e.scenarioName} (copy)`, status: 'draft', version: 1 });
  res.status(201).json({ success: true, data: redact(d, req.user.role) });
}));

const setStatus = (status, from) => wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  if (!from.includes(e.status)) throw new AppError(400, 'BAD_STATUS', `A ${e.status} estimate cannot be marked ${status}.`);
  const before = e.status;
  e.status = status;
  await e.save();
  await audit(req.user, `Estimate ${status}`, 'estimates', e.estimateNo, { status: before }, { status });
  ok(res, redact(e, req.user.role));
});
estimates.patch('/:id/send', setStatus('sent', ['draft']));
estimates.patch('/:id/accept', setStatus('accepted', ['sent']));
estimates.patch('/:id/reject', setStatus('rejected', ['sent']));

// Accepted estimate -> one booking per flight day (all-or-nothing).
estimates.post('/:id/create-booking', wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  if (e.status !== 'accepted') throw new AppError(400, 'BAD_STATUS', 'Only an accepted estimate can create bookings.');
  const d = z.object({ pilotId: z.string().length(24), slotId: z.string().length(24), dates: z.array(z.string()).min(1), location: z.string().default('Client site') }).parse(req.body);
  const created = [];
  try {
    for (const date of d.dates) {
      const { booking } = await createBooking({
        pilotId: d.pilotId, slotId: d.slotId, date, projectType: e.projectType, location: d.location, source: 'estimate', estimateId: e._id,
        contact: { name: e.clientName, company: e.clientName, phone: '9000000000', email: `ops+${e.estimateNo.toLowerCase()}@example.com` }, notes: `From ${e.estimateNo}`,
      }, req.user);
      created.push(booking);
    }
  } catch (err) {
    // Roll back anything already created so the slots are never half-blocked.
    await Booking.deleteMany({ _id: { $in: created.map((b) => b._id) } });
    throw err;
  }
  res.status(201).json({ success: true, data: created });
}));

estimates.get('/:id/pdf', wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  const t = e.totals; const i = e.inputs;
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${e.estimateNo}.pdf"`);
  doc.pipe(res);
  doc.rect(0, 0, 595, 90).fill('#0E7490');
  doc.fillColor('#fff').fontSize(22).text('QUANTUM TECH FPV', 50, 30).fontSize(10).text('Quotation · Fatima Nagar, Pune · GST 27AABFQ3848B1ZF', 50, 58);
  doc.fillColor('#0F172A').fontSize(16).text(`Quotation ${e.estimateNo}`, 50, 115);
  doc.fontSize(10).fillColor('#64748B').text(`Client: ${e.clientName || '-'}   ·   Project: ${e.projectType || '-'}   ·   Option: ${e.scenarioName}`, 50, 140)
    .text(`Valid until: ${e.validUntil?.toISOString().slice(0, 10)}`, 50, 155);
  // Client PDF: line items, total and GST only. No overhead, contingency or margin.
  const rows = [
    ['Pilot services', t.lines.pilots + t.lines.copilots], ['Drone & equipment', t.lines.drones], ['Travel & stay', t.lines.travel + t.lines.hotel + t.lines.food],
    ['Software & processing', t.lines.software], ['Report & data delivery', t.lines.report],
  ].filter(([, v]) => v > 0);
  const hidden = t.direct ? (t.beforeGst - t.direct) / t.direct : 0; // spread commercial loading across line items
  let y = 190;
  doc.fillColor('#64748B').fontSize(9).text('DESCRIPTION', 50, y).text('AMOUNT (INR)', 400, y, { width: 145, align: 'right' });
  y += 18; doc.moveTo(50, y).lineTo(545, y).strokeColor('#E2E8F0').stroke(); y += 10;
  doc.fillColor('#0F172A').fontSize(11);
  for (const [label, v] of rows) { doc.text(label, 50, y).text(inr(v * (1 + hidden)), 400, y, { width: 145, align: 'right' }); y += 24; }
  y += 6; doc.moveTo(50, y).lineTo(545, y).stroke(); y += 12;
  doc.text('Total before GST', 50, y).text(inr(t.beforeGst), 400, y, { width: 145, align: 'right' }); y += 22;
  doc.text(`GST (${i.taxPct}%)`, 50, y).text(inr(t.gst), 400, y, { width: 145, align: 'right' }); y += 26;
  doc.fontSize(14).fillColor('#0E7490').text('Grand total', 50, y).text(inr(t.grand), 400, y, { width: 145, align: 'right' });
  doc.fontSize(9).fillColor('#64748B').text('This is a computer-generated quotation. Terms: 50% advance, balance on report delivery.', 50, 760);
  doc.end();
}));

estimates.get('/:id/excel', wrap(async (req, res) => {
  const e = await Estimate.findById(req.params.id);
  const t = redact(e, req.user.role).totals;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Estimate');
  ws.columns = [{ header: 'Item', width: 32 }, { header: 'Amount (INR)', width: 18 }];
  ws.addRows(Object.entries(t.lines).map(([k, v]) => [k, v]));
  ws.addRow(['Direct cost', t.direct]);
  if (req.user.role === 'admin') ws.addRows([['Overhead', t.overhead], ['Contingency', t.contingency], ['Margin', t.margin]]);
  ws.addRows([['Total before GST', t.beforeGst], ['GST', t.gst], ['Grand total', t.grand], ['Value per day', t.perDay]]);
  ws.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${e.estimateNo}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

