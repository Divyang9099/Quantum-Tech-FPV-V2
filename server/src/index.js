import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { errorHandler } from './middleware/error.js';
import { setIo } from './realtime/io.js';
import { Booking } from './models/index.js';
import publicRoutes from './public/routes.js';
import authRoutes from './modules/auth.js';
import bookings, { availability } from './modules/bookings.js';
import { clients, enquiries, estimates, pilots } from './modules/ops.js';
import { auditLogs, dashboard, documents, fleet, masters, notifications, settings, users } from './modules/admin.js';
import { batches, certificates, students } from './modules/training.js';
import { startJobs } from './jobs/cron.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.origins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/public', publicRoutes);

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/bookings', bookings);
api.use('/availability', availability);
api.use('/pilots', pilots);
api.use('/clients', clients);
api.use('/enquiries', enquiries);
api.use('/estimates', estimates);
api.use('/dashboard', dashboard);
api.use('/masters', masters);
api.use('/settings', settings);
api.use('/users', users);
api.use('/audit-logs', auditLogs);
api.use('/notifications', notifications);
api.use('/drones', fleet);
api.use('/documents', documents);
api.use('/students', students);
api.use('/batches', batches);
api.use('/certificates', certificates);
app.use('/api/v1', api);

app.use((_req, res) => res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Not found.' }));
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.origins, credentials: true } });
setIo(io);

io.on('connection', (socket) => {
  // Public clients may only watch availability, or one booking after proving they hold its token.
  socket.join('public:availability');
  const t = socket.handshake.auth?.token;
  if (t) {
    try {
      const u = jwt.verify(t, env.access);
      socket.join(`role:${u.role}`);
      if (u.pilotId) socket.join(`pilot:${u.pilotId}`);
    } catch { /* ignore bad token */ }
  }
  socket.on('track', async ({ id, token }) => {
    if (await Booking.exists({ bookingId: id, trackingToken: token })) socket.join(`track:${id}`);
  });
});

await connectDb();
startJobs();
server.listen(env.port, () => console.log(`API on http://localhost:${env.port}`));
