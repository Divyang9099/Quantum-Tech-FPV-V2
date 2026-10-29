import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { Attendance, Batch, Certificate, Pilot, Student, TestResult, User } from '../models/index.js';
import { auth, rbac } from '../middleware/auth.js';
import { AppError, ok, wrap } from '../utils/errors.js';
import { newToken, nextCode } from '../utils/ids.js';
import { audit } from '../services/audit.js';

const AO = rbac('admin', 'office');
const A = rbac('admin');

// ---------------- Students ----------------
export const students = Router();
students.use(auth, AO);

students.get('/', wrap(async (req, res) => ok(res, await Student.find({ isDeleted: false, ...(req.query.status && { status: req.query.status }) }).sort({ createdAt: -1 }).populate('batchId', 'name'))));

students.get('/stats', wrap(async (_req, res) => {
  const all = await Student.find({ isDeleted: false });
  const n = (f) => all.filter(f).length;
  ok(res, {
    funnel: [
      { stage: 'Entered', n: all.length },
      { stage: 'Documents verified', n: n((s) => s.docs.length && s.docs.every((d) => d.verified) || ['verified', 'enrolled', 'passed', 'promoted'].includes(s.status)) },
      { stage: 'Fee paid', n: n((s) => s.feeStatus === 'paid') },
      { stage: 'Enrolled in batch', n: n((s) => !!s.batchId) },
    ],
  });
}));

students.post('/', wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(2), phone: z.string().min(10), email: z.string().email(), course: z.string(), partnerCompany: z.string().optional() }).parse(req.body);
  const s = await Student.create({ ...d, docs: [{ name: 'ID proof', verified: false }, { name: 'Education certificate', verified: false }] });
  await audit(req.user, 'Student entered', 'enrollment', s.name, null, { course: d.course });
  res.status(201).json({ success: true, data: s });
}));

students.patch('/:id/fee-status', wrap(async (req, res) => {
  const s = await Student.findByIdAndUpdate(req.params.id, { feeStatus: z.enum(['paid', 'unpaid']).parse(req.body.feeStatus) }, { new: true });
  await audit(req.user, `Fee marked ${s.feeStatus}`, 'enrollment', s.name);
  ok(res, s);
}));

students.patch('/:id/verify-documents', wrap(async (req, res) => {
  const s = await Student.findById(req.params.id);
  s.docs.forEach((d) => { d.verified = true; });
  if (s.status === 'entered') s.status = 'verified';
  await s.save();
  await audit(req.user, 'Documents verified', 'enrollment', s.name);
  ok(res, s);
}));

// ---------------- Batches ----------------
export const batches = Router();
batches.use(auth, AO);

batches.get('/', wrap(async (_req, res) => {
  const list = await Batch.find().sort({ startDate: -1 });
  const active = list.filter((b) => b.status === 'running');
  ok(res, list, { stats: { active: active.length, seatsFilled: list.reduce((a, b) => a + b.studentIds.length, 0), seats: list.reduce((a, b) => a + (b.seats || 0), 0), inTraining: active.reduce((a, b) => a + b.studentIds.length, 0) } });
}));

batches.post('/', wrap(async (req, res) => {
  const b = await Batch.create(z.object({ name: z.string().min(2), course: z.string(), instructor: z.string(), startDate: z.coerce.date(), seats: z.coerce.number().min(1) }).parse(req.body));
  await audit(req.user, 'Batch created', 'batches', b.name);
  res.status(201).json({ success: true, data: b });
}));

batches.get('/:id', wrap(async (req, res) => {
  const b = await Batch.findById(req.params.id).populate('studentIds', 'name phone status');
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Batch not found.');
  ok(res, { batch: b, attendance: await Attendance.find({ batchId: b._id }).sort({ date: -1 }), results: await TestResult.find({ batchId: b._id }) });
}));

batches.post('/:id/students', wrap(async (req, res) => {
  const { studentId, remove } = req.body;
  const b = await Batch.findById(req.params.id);
  if (remove) { b.studentIds.pull(studentId); await Student.findByIdAndUpdate(studentId, { batchId: null, status: 'verified' }); }
  else {
    if (b.studentIds.length >= b.seats) throw new AppError(400, 'FULL', 'This batch is full.');
    if (!b.studentIds.some((i) => String(i) === studentId)) b.studentIds.push(studentId);
    await Student.findByIdAndUpdate(studentId, { batchId: b._id, status: 'enrolled' });
  }
  await b.save();
  await audit(req.user, remove ? 'Student removed from batch' : 'Student added to batch', 'batches', b.name);
  ok(res, b);
}));

batches.post('/:id/attendance', wrap(async (req, res) => {
  const d = z.object({ date: z.string(), records: z.array(z.object({ studentId: z.string(), present: z.boolean() })) }).parse(req.body);
  const a = await Attendance.findOneAndUpdate({ batchId: req.params.id, date: d.date }, { records: d.records }, { upsert: true, new: true });
  await audit(req.user, 'Attendance recorded', 'batches', req.params.id, null, { date: d.date });
  ok(res, a);
}));

// Test marks: a pass creates a PENDING certificate for Admin approval.
batches.post('/:id/test-results', wrap(async (req, res) => {
  const d = z.object({ studentId: z.string(), marks: z.coerce.number().min(0).max(100) }).parse(req.body);
  const result = d.marks >= 50 ? 'pass' : 'fail';
  const tr = await TestResult.findOneAndUpdate({ batchId: req.params.id, studentId: d.studentId }, { ...d, result, enteredBy: req.user.id }, { upsert: true, new: true });
  const s = await Student.findById(d.studentId);
  if (result === 'pass' && s.status !== 'promoted') {
    s.status = 'passed';
    await s.save();
    if (!(await Certificate.exists({ studentId: s._id }))) {
      await Certificate.create({ studentId: s._id, holderName: s.name, level: 'Level 1', status: 'pending' });
    }
  }
  await audit(req.user, `Test marks entered (${result})`, 'batches', s.name, null, { marks: d.marks });
  ok(res, tr);
}));

// ---------------- Certificates ----------------
export const certificates = Router();
certificates.use(auth);

certificates.get('/', AO, wrap(async (req, res) => {
  const all = await Certificate.find(req.query.status ? { status: req.query.status } : {}).sort({ createdAt: -1 });
  const now = new Date(); const soon = new Date(Date.now() + 30 * 864e5);
  const approved = all.filter((c) => c.status === 'approved');
  ok(res, all, { stats: { valid: approved.filter((c) => c.expiryDate > soon).length, expiring: approved.filter((c) => c.expiryDate >= now && c.expiryDate <= soon).length, expired: approved.filter((c) => c.expiryDate < now).length, pending: all.filter((c) => c.status === 'pending').length } });
}));

// Approve -> create Pilot + User, link, mark student promoted. All or nothing.
certificates.patch('/:id/approve', A, wrap(async (req, res) => {
  const session = await mongoose.startSession();
  let out;
  try {
    await session.withTransaction(async () => {
      const cert = await Certificate.findById(req.params.id).session(session);
      if (!cert || cert.status !== 'pending') throw new AppError(400, 'BAD_STATUS', 'This certificate is not waiting for approval.');
      const s = await Student.findById(cert.studentId).session(session);
      const code = await nextCode('pilot', 'P-');
      const [pilot] = await Pilot.create([{ code, name: s.name, phone: s.phone, email: s.email, level: req.body.level || cert.level, baseCity: req.body.baseCity || 'Pune', skills: ['FPV Basics'], source: 'trained' }], { session });
      const [user] = await User.create([{ name: s.name, email: s.email, role: 'pilot', pilotId: pilot._id, passwordHash: await bcrypt.hash('Pilot@123', 8) }], { session });
      pilot.userId = user._id;
      const issue = new Date();
      Object.assign(cert, { status: 'approved', pilotId: pilot._id, approvedBy: req.user.id, issueDate: issue, expiryDate: new Date(issue.getTime() + 365 * 864e5), level: pilot.level, certNo: `QTF-${code}-${issue.getFullYear()}`, qrToken: newToken() });
      pilot.certificateId = cert._id;
      s.status = 'promoted';
      await Promise.all([pilot.save({ session }), cert.save({ session }), s.save({ session })]);
      out = { pilot, certificate: cert };
    });
  } finally { await session.endSession(); }
  await audit(req.user, 'Certificate approved; student promoted to pilot', 'certificates', out.certificate.certNo, null, { pilot: out.pilot.code });
  ok(res, out);
}));

certificates.get('/:id/pdf', wrap(async (req, res) => {
  const c = await Certificate.findById(req.params.id);
  if (!c || c.status !== 'approved') throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
  if (req.user.role === 'pilot' && String(c.pilotId) !== req.user.pilotId) throw new AppError(403, 'FORBIDDEN', 'Not allowed.');
  const origin = process.env.WEBSITE_ORIGIN || 'http://localhost:5500';
  const qr = await QRCode.toBuffer(`${origin}/verify.html?t=${c.qrToken}`, { margin: 1, width: 150 });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${c.certNo}.pdf"`);
  doc.pipe(res);
  doc.rect(25, 25, 792, 545).lineWidth(2).strokeColor('#0E7490').stroke();
  doc.fillColor('#0E7490').fontSize(14).text('QUANTUM TECH FPV', 0, 70, { align: 'center', characterSpacing: 3 });
  doc.fillColor('#0F172A').fontSize(34).text('Certificate of Completion', 0, 110, { align: 'center' });
  doc.fillColor('#64748B').fontSize(13).text('This is to certify that', 0, 190, { align: 'center' });
  doc.fillColor('#0F172A').fontSize(30).text(c.holderName, 0, 220, { align: 'center' });
  doc.fillColor('#64748B').fontSize(13).text(`has successfully completed FPV pilot training and is certified as a ${c.level} pilot.`, 0, 275, { align: 'center' });
  doc.fontSize(11).text(`Certificate no: ${c.certNo}   ·   Issued: ${c.issueDate.toISOString().slice(0, 10)}   ·   Valid till: ${c.expiryDate.toISOString().slice(0, 10)}`, 0, 330, { align: 'center' });
  doc.image(qr, 346, 380, { width: 110 });
  doc.fontSize(9).text('Scan to verify', 0, 495, { align: 'center' });
  doc.end();
}));
