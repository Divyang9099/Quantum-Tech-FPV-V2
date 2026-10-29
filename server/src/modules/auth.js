import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { auth } from '../middleware/auth.js';
import { AppError, ok, wrap } from '../utils/errors.js';
import { audit } from '../services/audit.js';

const r = Router();
const sign = (u) => jwt.sign({ id: String(u._id), name: u.name, role: u.role, pilotId: u.pilotId && String(u.pilotId) }, env.access, { expiresIn: '15m' });
const refresh = (u) => jwt.sign({ id: String(u._id) }, env.refresh, { expiresIn: '7d' });
const cookie = { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 };
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, pilotId: u.pilotId });

r.post('/login', wrap(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = await User.findOne({ email: email.toLowerCase(), isActive: true });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new AppError(401, 'BAD_LOGIN', 'Incorrect email or password.');
  u.lastLogin = new Date();
  await u.save();
  await audit({ id: u._id, name: u.name }, 'Logged in', 'auth', u._id);
  res.cookie('rt', refresh(u), cookie);
  ok(res, { token: sign(u), user: publicUser(u) });
}));

r.post('/refresh', wrap(async (req, res) => {
  try {
    const p = jwt.verify(req.cookies?.rt || '', env.refresh);
    const u = await User.findById(p.id);
    if (!u?.isActive) throw new Error('inactive');
    ok(res, { token: sign(u), user: publicUser(u) });
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Please log in.');
  }
}));

r.post('/logout', (_req, res) => { res.clearCookie('rt'); ok(res, true); });
r.get('/me', auth, wrap(async (req, res) => ok(res, publicUser(await User.findById(req.user.id)))));

export default r;
