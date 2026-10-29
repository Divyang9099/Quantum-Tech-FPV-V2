import { nextStage, STAGE_ROLES } from 'shared';
import { Availability, Booking, Certificate, Client, Master, Pilot } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { newBookingId, newToken } from '../utils/ids.js';
import { audit } from './audit.js';
import { notify } from './notification.js';
import { emit } from '../realtime/io.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Pilots that are certified (valid on `date`) and not marked off that day. */
export async function bookablePilots(date, { city } = {}) {
  const certs = await Certificate.find({ status: 'approved', expiryDate: { $gte: new Date(date) } }).select('pilotId');
  const certified = certs.map((c) => c.pilotId);
  const off = await Availability.find({ date }).select('pilotId');
  const offIds = off.map((o) => String(o.pilotId));
  const q = { _id: { $in: certified }, isDeleted: false, status: 'active' };
  if (city) q.baseCity = city;
  const pilots = await Pilot.find(q).sort({ code: 1 });
  return pilots.filter((p) => !offIds.includes(String(p._id)));
}

export async function findOrCreateClient(c) {
  const or = [];
  if (c.email) or.push({ email: c.email.toLowerCase() });
  if (c.phone) or.push({ phone: c.phone });
  let client = or.length ? await Client.findOne({ $or: or }) : null;
  if (!client) {
    client = await Client.create({ company: c.company, contactName: c.name, phone: c.phone, email: c.email?.toLowerCase() });
  }
  return client;
}

export async function createBooking(input, user) {
  const { pilotId, date, slotId, source = 'website' } = input;
  if (date < today()) throw new AppError(400, 'PAST_DATE', 'Please pick today or a future date.');

  const pilot = await Pilot.findOne({ _id: pilotId, isDeleted: false });
  const slot = await Master.findOne({ _id: slotId, kind: 'slot', isActive: true });
  if (!pilot || !slot) throw new AppError(400, 'INVALID_SLOT', 'That slot is not available.');
  const ok = (await bookablePilots(date)).some((p) => String(p._id) === String(pilot._id));
  if (!ok) throw new AppError(409, 'PILOT_UNAVAILABLE', 'That pilot is not available on this date. Please pick another.');

  const bookingId = newBookingId();
  const trackingToken = newToken();
  const client = await findOrCreateClient(input.contact);
  let booking;
  try {
    booking = await Booking.create({
      bookingId, trackingToken, pilotId, date, slotId, clientId: client._id,
      projectType: input.projectType, location: input.location, source,
      contact: input.contact, notes: input.notes, estimateId: input.estimateId,
      stageHistory: [{ stage: 'booked', at: new Date(), by: user?.name || 'Website' }],
    });
  } catch (e) {
    if (e.code === 11000) throw new AppError(409, 'SLOT_TAKEN', 'This slot was just taken. Please pick another.');
    throw e;
  }
  await Client.updateOne({ _id: client._id }, { $inc: { bookingCount: 1 } });

  const who = source === 'website' ? 'website' : source === 'estimate' ? 'estimate' : 'phone';
  await audit(user, `Booking created from ${who}`, 'bookings', booking.bookingId, null, { pilot: pilot.code, date, slot: slot.name });
  await notify('booking.created', { booking, pilot, slot, client });
  emit(['role:admin', 'role:office', `pilot:${pilot._id}`, 'public:availability'], 'booking.created', {
    bookingId: booking.bookingId, date, pilotCode: pilot.code, source,
  });
  return { booking, pilot, slot };
}

export async function changeStage(booking, stage, user) {
  const cur = booking.stage;
  if (cur === 'cancelled') throw new AppError(400, 'CANCELLED', 'This booking is cancelled.');
  if (nextStage(cur) !== stage) throw new AppError(400, 'BAD_STAGE', 'That step is not allowed yet.');
  if (!STAGE_ROLES[stage]?.includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'You cannot make this change.');

  booking.stage = stage;
  booking.stageHistory.push({ stage, at: new Date(), by: user.name });
  // Hours are credited once, atomically, only when the flight is completed.
  if (stage === 'flight_completed' && !booking.hoursCredited) {
    booking.hoursCredited = true;
    await Pilot.updateOne({ _id: booking.pilotId }, { $inc: { flightHours: booking.flightHours || 2 } });
  }
  await booking.save();
  await audit(user, `Stage changed to ${stage}`, 'bookings', booking.bookingId, { stage: cur }, { stage });
  emit(['role:admin', 'role:office', `pilot:${booking.pilotId}`, `track:${booking.bookingId}`], 'booking.stageChanged', {
    bookingId: booking.bookingId, stage,
  });
  return booking;
}

export async function cancelBooking(booking, reason, user) {
  if (['report_delivered', 'cancelled'].includes(booking.stage)) {
    throw new AppError(400, 'CANNOT_CANCEL', 'This booking can no longer be cancelled.');
  }
  const before = booking.stage;
  booking.stage = 'cancelled';
  booking.cancelReason = reason;
  booking.stageHistory.push({ stage: 'cancelled', at: new Date(), by: user.name });
  await booking.save();
  await audit(user, 'Booking cancelled', 'bookings', booking.bookingId, { stage: before }, { stage: 'cancelled', reason });
  emit(['role:admin', 'role:office', `pilot:${booking.pilotId}`, `track:${booking.bookingId}`, 'public:availability'],
    'booking.cancelled', { bookingId: booking.bookingId, date: booking.date });
  return booking;
}

export async function rescheduleBooking(booking, { date, slotId, pilotId }, user) {
  const before = { date: booking.date, slotId: booking.slotId, pilotId: booking.pilotId };
  booking.date = date || booking.date;
  booking.slotId = slotId || booking.slotId;
  booking.pilotId = pilotId || booking.pilotId;
  try {
    await booking.save();
  } catch (e) {
    if (e.code === 11000) throw new AppError(409, 'SLOT_TAKEN', 'That slot is already taken.');
    throw e;
  }
  await audit(user, 'Booking rescheduled', 'bookings', booking.bookingId, before,
    { date: booking.date, slotId: booking.slotId, pilotId: booking.pilotId });
  emit(['role:admin', 'role:office', `pilot:${booking.pilotId}`, `track:${booking.bookingId}`, 'public:availability'],
    'booking.stageChanged', { bookingId: booking.bookingId, stage: booking.stage });
  return booking;
}
