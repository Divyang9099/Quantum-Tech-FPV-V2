import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const T = { timestamps: true };
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref });

export const Master = model('Master', new Schema({
  kind: { type: String, index: true }, // projectType, city, slot, pilotLevel, skill, droneType, travelMode, deliverable, docType, course
  name: String, code: String, isActive: { type: Boolean, default: true },
  extra: Schema.Types.Mixed, order: { type: Number, default: 0 },
}, T));

export const Setting = model('Setting', new Schema({
  key: { type: String, unique: true }, value: Schema.Types.Mixed,
}, T));

export const User = model('User', new Schema({
  name: String, email: { type: String, unique: true, lowercase: true },
  passwordHash: String, role: { type: String, enum: ['admin', 'office', 'pilot'] },
  pilotId: oid('Pilot'), isActive: { type: Boolean, default: true }, lastLogin: Date,
}, T));

export const Pilot = model('Pilot', new Schema({
  code: { type: String, unique: true }, userId: oid('User'), name: String, phone: String, email: String,
  level: String, skills: [String], baseCity: String, flightHours: { type: Number, default: 0 },
  status: { type: String, default: 'active' }, certificateId: oid('Certificate'),
  source: { type: String, default: 'manual' }, isDeleted: { type: Boolean, default: false },
}, T));

export const Certificate = model('Certificate', new Schema({
  pilotId: oid('Pilot'), studentId: oid('Student'), holderName: String, certNo: String, level: String,
  issueDate: Date, expiryDate: Date,
  status: { type: String, enum: ['pending', 'approved', 'expired'], default: 'pending' },
  qrToken: { type: String, index: true }, approvedBy: oid('User'),
}, T));

export const Student = model('Student', new Schema({
  name: String, phone: String, email: String, course: String, partnerCompany: String,
  docs: [{ name: String, url: String, verified: Boolean }],
  feeStatus: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' }, batchId: oid('Batch'),
  status: { type: String, enum: ['entered', 'verified', 'enrolled', 'passed', 'promoted'], default: 'entered' },
  isDeleted: { type: Boolean, default: false },
}, T));

export const Batch = model('Batch', new Schema({
  name: String, course: String, instructor: String, startDate: Date, seats: Number,
  studentIds: [oid('Student')],
  status: { type: String, enum: ['upcoming', 'running', 'completed'], default: 'upcoming' },
}, T));

export const Attendance = model('Attendance', new Schema({
  batchId: oid('Batch'), date: String, records: [{ studentId: oid('Student'), present: Boolean }],
}, T));

export const TestResult = model('TestResult', new Schema({
  batchId: oid('Batch'), studentId: oid('Student'), marks: Number,
  result: { type: String, enum: ['pass', 'fail'] }, enteredBy: oid('User'),
}, T));

const availability = new Schema({
  pilotId: oid('Pilot'), date: String, type: { type: String, enum: ['off', 'leave'], default: 'off' }, reason: String,
}, T);
availability.index({ pilotId: 1, date: 1 }, { unique: true });
export const Availability = model('Availability', availability);

const booking = new Schema({
  bookingId: { type: String, unique: true }, trackingToken: String,
  pilotId: oid('Pilot'), date: String, slotId: oid('Master'), clientId: oid('Client'),
  projectType: String, location: String,
  source: { type: String, enum: ['website', 'phone', 'estimate'] },
  stage: {
    type: String, default: 'booked',
    enum: ['booked', 'checked_in', 'flight_completed', 'report_delivered', 'cancelled'],
  },
  stageHistory: [{ stage: String, at: Date, by: String }],
  contact: { name: String, company: String, phone: String, email: String },
  notes: String, estimateId: oid('Estimate'), cancelReason: String,
  flightHours: { type: Number, default: 2 }, hoursCredited: { type: Boolean, default: false },
}, T);
booking.index(
  { pilotId: 1, date: 1, slotId: 1 },
  // MongoDB partial indexes reject $ne, so list the live stages: a cancelled booking frees the slot.
  { unique: true, partialFilterExpression: { stage: { $in: ['booked', 'checked_in', 'flight_completed', 'report_delivered'] } } },
);
export const Booking = model('Booking', booking);

const client = new Schema({
  company: String, contactName: String, phone: String, email: String,
  siteContacts: [{ name: String, phone: String }], bookingCount: { type: Number, default: 0 },
}, T);
client.index({ email: 1 });
client.index({ phone: 1 });
export const Client = model('Client', client);

export const Enquiry = model('Enquiry', new Schema({
  refNo: { type: String, unique: true }, name: String, company: String, phone: String, email: String, details: String,
  status: { type: String, enum: ['new', 'in_discussion', 'converted', 'closed'], default: 'new' }, convertedTo: String,
}, T));

export const Estimate = model('Estimate', new Schema({
  estimateNo: String, enquiryId: oid('Enquiry'), scenarioName: String, clientId: oid('Client'), clientName: String,
  projectType: String,
  status: { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'draft' },
  validUntil: Date, inputs: Schema.Types.Mixed, totals: Schema.Types.Mixed, version: { type: Number, default: 1 },
}, T));

export const Drone = model('Drone', new Schema({
  code: String, type: String, status: { type: String, enum: ['free', 'in_use', 'repair'], default: 'free' },
  serviceDueDate: Date, cycles: { type: Number, default: 0 },
}, T));

export const Document = model('Document', new Schema({
  type: String, title: String, fileUrl: String, linkedTo: { kind: String, id: String },
  expiryDate: Date, uploadedBy: oid('User'),
}, T));

export const AuditLog = model('AuditLog', new Schema({
  userId: String, userName: String, action: String, module: String, entityId: String,
  before: Schema.Types.Mixed, after: Schema.Types.Mixed, ip: String,
}, { timestamps: { createdAt: 'timestamp', updatedAt: false } }));

export const Counter = model('Counter', new Schema({
  name: { type: String, unique: true }, seq: { type: Number, default: 0 },
}));

export const Notification = model('Notification', new Schema({
  role: String, userId: oid('User'), title: String, link: String, read: { type: Boolean, default: false },
}, T));

export const NotificationLog = model('NotificationLog', new Schema({
  channel: String, to: String, template: String, status: String, payload: Schema.Types.Mixed,
}, T));
