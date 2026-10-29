import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker/locale/en_IN';
import { calculateEstimate } from 'shared';
import { connectDb } from '../config/db.js';
import * as M from '../models/index.js';
import { DEFAULT_RATES } from '../services/settings.js';
import { newBookingId, newToken } from '../utils/ids.js';

faker.seed(2026);
const DAY = 864e5;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * DAY);
const pick = (a) => a[Math.floor(faker.number.float() * a.length)];
const mobile = () => `9${faker.string.numeric(9)}`;

export async function seed() {
  for (const m of Object.values(M)) if (m.deleteMany) await m.deleteMany({});
  await Promise.all(Object.values(M).map((m) => m.syncIndexes?.()));

  // ---- Masters ----
  const mk = (kind, names, fn = () => ({})) => M.Master.insertMany(names.map((name, i) => ({ kind, name, order: i, extra: fn(name, i) })));
  const projectTypes = await mk('projectType', ['Survey', 'Mapping', 'Inspection', 'Event shoot', 'Tethered surveillance', 'Agriculture spraying', 'Real estate', 'Construction monitoring', 'Solar inspection']);
  await mk('city', ['Pune', 'Pimpri-Chinchwad', 'Mumbai', 'Nashik', 'Nagpur', 'Chhatrapati Sambhajinagar', 'Kolhapur'], () => ({ state: 'Maharashtra' }));
  const slotDefs = [['Morning 1', '07:00', '10:00'], ['Morning 2', '10:00', '13:00'], ['Afternoon', '14:00', '17:00'], ['Evening', '17:00', '19:00']];
  const slots = await M.Master.insertMany(slotDefs.map(([name, startTime, endTime], i) => ({ kind: 'slot', name: `${name} (${startTime}-${endTime})`, order: i, extra: { startTime, endTime } })));
  await mk('pilotLevel', Object.keys(DEFAULT_RATES.pilotRates), (n) => ({ ratePerDay: DEFAULT_RATES.pilotRates[n] }));
  await mk('droneType', Object.keys(DEFAULT_RATES.droneRates), (n) => ({ ratePerDay: DEFAULT_RATES.droneRates[n] }));
  await mk('skill', ['FPV Basics', 'Cinematic', 'Mapping', 'Inspection', 'Thermal', 'Agri Spraying', 'Tethered Ops']);
  await mk('travelMode', ['Road (car)', 'Rail', 'Flight']);
  await mk('deliverable', ['Video', 'Photos', 'Report', 'Map']);
  await mk('docType', ['Drone permission', 'Insurance', 'Client NOC', 'Pilot licence']);
  await mk('course', ['FPV Pilot Foundation', 'Advanced Mapping & Survey', 'Tethered UAV Operator']);
  await M.Setting.create({ key: 'rateLibrary', value: DEFAULT_RATES });
  await M.Setting.create({ key: 'showPilotNames', value: false });

  // ---- Users + Pilots ----
  const hash = (p) => bcrypt.hash(p, 8);
  const adminHash = await hash('Admin@123'); const officeHash = await hash('Office@123'); const pilotHash = await hash('Pilot@123');
  await M.User.create({ name: 'Nihal', email: 'admin@quantumtechfpv.com', role: 'admin', passwordHash: adminHash });
  await M.User.create({ name: 'Riya Deshmukh', email: 'office@quantumtechfpv.com', role: 'office', passwordHash: officeHash });
  await M.User.create({ name: 'Sameer Kulkarni', email: 'office2@quantumtechfpv.com', role: 'office', passwordHash: officeHash });

  const levels = [...Array(6).fill('Level 1'), ...Array(5).fill('Level 2'), ...Array(3).fill('Level 3'), ...Array(2).fill('Expert')];
  const cities = ['Pune', 'Pune', 'Pune', 'Pimpri-Chinchwad', 'Mumbai', 'Mumbai', 'Nashik', 'Nagpur', 'Chhatrapati Sambhajinagar', 'Kolhapur'];
  const skillNames = ['FPV Basics', 'Cinematic', 'Mapping', 'Inspection', 'Thermal', 'Agri Spraying', 'Tethered Ops'];
  const pilots = [];
  for (let i = 0; i < 16; i++) {
    const name = faker.person.fullName();
    const code = `P-${String(i + 1).padStart(3, '0')}`;
    const p = await M.Pilot.create({
      code, name, phone: mobile(), email: `pilot${i + 1}@quantumtechfpv.com`, level: levels[i], baseCity: cities[i % cities.length],
      skills: faker.helpers.arrayElements(skillNames, { min: 2, max: 3 }), source: i < 10 ? 'trained' : 'manual',
      flightHours: Math.round(40 + faker.number.float() * 600),
    });
    const u = await M.User.create({ name, email: `pilot${i + 1}@quantumtechfpv.com`, role: 'pilot', pilotId: p._id, passwordHash: pilotHash });
    p.userId = u._id;
    // P-016 has an EXPIRED certificate; P-014 and P-015 expire within 30 days.
    const expiry = i === 15 ? addDays(-20) : i === 14 ? addDays(12) : i === 13 ? addDays(25) : addDays(120 + Math.round(faker.number.float() * 240));
    const c = await M.Certificate.create({
      pilotId: p._id, holderName: name, level: p.level, certNo: `QTF-${code}-2026`, status: 'approved',
      issueDate: addDays(-300), expiryDate: expiry, qrToken: newToken(),
    });
    p.certificateId = c._id;
    await p.save();
    pilots.push(p);
  }
  const certified = pilots.slice(0, 15); // P-016 is not bookable

  // ---- Clients ----
  const industries = ['Constructions', 'Solar Energy', 'Realty', 'Events', 'Infra Projects', 'Agro Industries', 'Power Grid', 'Engineering'];
  const clients = [];
  for (let i = 0; i < 60; i++) {
    clients.push(await M.Client.create({
      company: `${faker.person.lastName()} ${pick(industries)} ${pick(['Pvt Ltd', 'LLP', 'Associates'])}`, contactName: faker.person.fullName(), phone: mobile(),
      email: faker.internet.email({ provider: 'example.com' }).toLowerCase(), createdAt: addDays(-Math.round(faker.number.float() * 360)),
    }));
  }

  // ---- Bookings: 12 months of history, today, and the next 14 days ----
  const used = new Set();
  const bookings = [];
  const types = projectTypes.map((p) => p.name);
  const cityNames = ['Pune', 'Mumbai', 'Nashik', 'Nagpur', 'Pimpri-Chinchwad'];
  const mkBooking = (offset, stage, source = 'website') => {
    for (let tries = 0; tries < 25; tries++) {
      const pilot = pick(certified); const slot = pick(slots); const date = iso(addDays(offset));
      const k = `${pilot._id}:${date}:${slot._id}`;
      if (used.has(k)) continue;
      used.add(k);
      const c = pick(clients);
      const created = addDays(offset - 1 - Math.round(faker.number.float() * 6));
      const hist = [{ stage: 'booked', at: created, by: source === 'website' ? 'Website' : 'Riya Deshmukh' }];
      if (['checked_in', 'flight_completed', 'report_delivered'].includes(stage)) hist.push({ stage: 'checked_in', at: addDays(offset), by: pilot.name });
      if (['flight_completed', 'report_delivered'].includes(stage)) hist.push({ stage: 'flight_completed', at: addDays(offset), by: pilot.name });
      if (stage === 'report_delivered') hist.push({ stage: 'report_delivered', at: addDays(offset + 2), by: 'Riya Deshmukh' });
      if (stage === 'cancelled') hist.push({ stage: 'cancelled', at: addDays(offset - 1), by: 'Riya Deshmukh' });
      return {
        bookingId: newBookingId(), trackingToken: newToken(), pilotId: pilot._id, date, slotId: slot._id, clientId: c._id,
        projectType: pick(types), location: pick(cityNames), source, stage, stageHistory: hist,
        contact: { name: c.contactName, company: c.company, phone: c.phone, email: c.email },
        flightHours: 2 + Math.round(faker.number.float() * 4), hoursCredited: ['flight_completed', 'report_delivered'].includes(stage), createdAt: created,
      };
    }
    return null;
  };
  const push = (b) => b && bookings.push(b);
  for (let d = -360; d < -2; d++) {
    const month = addDays(d).getMonth();
    const busy = [9, 10, 11, 0, 1, 2].includes(month) ? 2 : 1; // more work Oct to Mar
    const n = faker.number.float() < 0.5 * busy ? busy : 0;
    for (let i = 0; i < n; i++) {
      const r = faker.number.float();
      push(mkBooking(d, r < 0.08 ? 'cancelled' : r < 0.92 ? 'report_delivered' : 'flight_completed', pick(['website', 'website', 'phone'])));
    }
  }
  for (const d of [-2, -1]) push(mkBooking(d, 'report_delivered'));
  ['booked', 'booked', 'checked_in', 'flight_completed', 'report_delivered', 'booked'].forEach((s) => push(mkBooking(0, s)));
  for (let d = 1; d <= 14; d++) for (let i = 0; i < 2; i++) if (faker.number.float() < 0.8) push(mkBooking(d, 'booked', pick(['website', 'phone'])));
  await M.Booking.insertMany(bookings.filter(Boolean));
  for (const c of clients) c.bookingCount = bookings.filter((b) => String(b.clientId) === String(c._id)).length;
  await Promise.all(clients.map((c) => c.save()));

  // 35% repeat clients is implied by random reuse of 60 clients over ~400 bookings.

  // ---- Availability: 2 pilots on leave today (only pilots without a booking today) ----
  const busyToday = new Set(bookings.filter((b) => b.date === iso(new Date())).map((b) => String(b.pilotId)));
  const freeToday = certified.filter((p) => !busyToday.has(String(p._id))).slice(0, 2);
  for (const p of freeToday) await M.Availability.create({ pilotId: p._id, date: iso(new Date()), type: 'leave', reason: 'Personal' });
  for (const p of certified.slice(2, 6)) {
    const date = iso(addDays(3 + Math.round(faker.number.float() * 8)));
    if (!bookings.some((b) => String(b.pilotId) === String(p._id) && b.date === date)) await M.Availability.create({ pilotId: p._id, date, type: 'off', reason: 'Training day' });
  }

  // ---- Enquiries (25) ----
  const statuses = [...Array(6).fill('new'), ...Array(5).fill('in_discussion'), ...Array(9).fill('converted'), ...Array(5).fill('closed')];
  const enquiries = [];
  for (let i = 0; i < 25; i++) {
    enquiries.push(await M.Enquiry.create({
      refNo: `ENQ-${String(i + 1).padStart(4, '0')}`, name: faker.person.fullName(), company: pick(clients).company, phone: mobile(), email: faker.internet.email({ provider: 'example.com' }).toLowerCase(),
      status: statuses[i], details: pick(['Need a 5-day mapping survey for a 300-acre site near Pune.', 'Tethered drone surveillance for a 3-day public event.', 'Monthly construction progress monitoring for 6 months.', 'Solar farm thermal inspection, about 40 MW, 2 days.', 'Agriculture spraying across 150 acres in two phases.']),
      createdAt: addDays(-Math.round(faker.number.float() * 120)),
    }));
  }

  // ---- Estimates (30) ----
  const estStatus = [...Array(6).fill('draft'), ...Array(8).fill('sent'), ...Array(9).fill('accepted'), ...Array(4).fill('rejected'), ...Array(3).fill('expired')];
  for (let i = 0; i < 30; i++) {
    const lvl = pick(Object.keys(DEFAULT_RATES.pilotRates)); const dr = pick(Object.keys(DEFAULT_RATES.droneRates));
    const inputs = {
      flightDays: 1 + Math.round(faker.number.float() * 5), postDays: 1 + Math.round(faker.number.float() * 3), teamSize: 2 + Math.round(faker.number.float() * 2),
      pilots: 1 + Math.round(faker.number.float()), pilotRate: DEFAULT_RATES.pilotRates[lvl], copilots: i % 3 === 0 ? 1 : 0, copilotRate: 4000,
      drones: 1 + Math.round(faker.number.float()), droneRate: DEFAULT_RATES.droneRates[dr], ratePerKm: 14, distanceKm: 40 + Math.round(faker.number.float() * 400), trips: 2,
      hotelNights: Math.round(faker.number.float() * 4), hotelRate: 2500, dailyTravel: 800, foodPerDay: 600, softwareCost: 3000, reportHours: 6, reportRate: 900, dataStorage: 1500,
      overheadPct: 10, contingencyPct: 5, marginPct: 20, taxPct: 18,
    };
    const status = estStatus[i];
    await M.Estimate.create({
      estimateNo: `EST-${String(i + 1).padStart(4, '0')}`, scenarioName: i === 5 ? 'Premium' : i === 4 ? 'Base' : 'Base', clientName: pick(clients).company, projectType: pick(types),
      status, validUntil: status === 'expired' ? addDays(-5) : addDays(10), inputs, totals: calculateEstimate(inputs), enquiryId: enquiries[i % 25]._id, createdAt: addDays(-Math.round(faker.number.float() * 90)),
    });
  }

  // ---- Training: 3 batches, 45 students, 2 certificates pending ----
  const course = 'FPV Pilot Foundation';
  const batchDefs = [['FPV-2026-A', 'completed', -90], ['FPV-2026-B', 'running', -15], ['FPV-2026-C', 'upcoming', 20]];
  const allStudents = [];
  for (const [bi, [name, status, off]] of batchDefs.entries()) {
    const b = await M.Batch.create({ name, course, instructor: 'Capt. R. Joshi', startDate: addDays(off), seats: 20, status });
    const count = bi === 2 ? 5 : 20;
    for (let i = 0; i < count; i++) {
      const s = await M.Student.create({
        name: faker.person.fullName(), phone: mobile(), email: faker.internet.email({ provider: 'example.com' }).toLowerCase(), course,
        partnerCompany: bi === 1 && i < 6 ? 'Maha Defence Academy' : undefined, feeStatus: faker.number.float() < 0.8 ? 'paid' : 'unpaid',
        docs: [{ name: 'ID proof', verified: true }, { name: 'Education certificate', verified: true }], batchId: b._id,
        status: bi === 0 ? 'promoted' : 'enrolled',
      });
      b.studentIds.push(s._id); allStudents.push({ s, bi });
    }
    await b.save();
  }
  const running = allStudents.filter((x) => x.bi === 1).map((x) => x.s);
  for (const s of running.slice(0, 2)) {
    s.status = 'passed'; await s.save();
    await M.Certificate.create({ studentId: s._id, holderName: s.name, level: 'Level 1', status: 'pending' });
  }
  const batchB = await M.Batch.findOne({ name: 'FPV-2026-B' });
  for (let d = 1; d <= 6; d++) {
    await M.Attendance.create({ batchId: batchB._id, date: iso(addDays(-d * 2)), records: running.map((s) => ({ studentId: s._id, present: faker.number.float() > 0.12 })) });
  }

  // ---- Fleet (14 drones) ----
  const dTypes = Object.keys(DEFAULT_RATES.droneRates);
  for (let i = 0; i < 14; i++) {
    await M.Drone.create({
      code: `DR-${String(i + 1).padStart(3, '0')}`, type: dTypes[i % dTypes.length], status: i < 2 ? 'repair' : i < 6 ? 'in_use' : 'free',
      serviceDueDate: i === 7 ? addDays(5) : addDays(40 + i * 10), cycles: 20 + i * 11,
    });
  }

  // ---- Documents (40; 3 expiring in 30 days, 1 expired) ----
  const docTypes = ['Drone permission', 'Insurance', 'Client NOC', 'Pilot licence'];
  for (let i = 0; i < 40; i++) {
    const exp = i < 3 ? addDays(5 + i * 8) : i === 3 ? addDays(-10) : addDays(60 + Math.round(faker.number.float() * 300));
    await M.Document.create({ type: docTypes[i % 4], title: `${docTypes[i % 4]} - ${i % 4 === 2 ? pick(clients).company : `Batch ${i + 1}`}`, fileUrl: '#', expiryDate: exp, linkedTo: { kind: 'client', id: 'demo' } });
  }

  // ---- Audit log (from seeded actions) ----
  const staff = ['Riya Deshmukh', 'Sameer Kulkarni', 'Nihal'];
  const logs = bookings.slice(-400).map((b) => ({ userId: 'seed', userName: b.source === 'website' ? 'System' : pick(staff), action: `Booking created from ${b.source}`, module: 'bookings', entityId: b.bookingId, timestamp: b.createdAt }));
  await M.AuditLog.insertMany(logs);

  const counts = await Promise.all(['Booking', 'Client', 'Pilot', 'Enquiry', 'Estimate', 'Student', 'Drone', 'Document', 'AuditLog'].map(async (n) => `${n}: ${await M[n].countDocuments()}`));
  console.log('Seeded ->', counts.join(' | '));
  await M.Counter.updateOne({ name: 'pilot' }, { seq: 16 }, { upsert: true });
  await M.Counter.updateOne({ name: 'enquiry' }, { seq: 25 }, { upsert: true });
  await M.Counter.updateOne({ name: 'estimate' }, { seq: 30 }, { upsert: true });
}

if (process.argv[1].endsWith('seed.js')) {
  await connectDb();
  await seed();
  process.exit(0);
}
