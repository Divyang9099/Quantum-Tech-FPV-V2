import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in.'));
  try {
    req.user = jwt.verify(t, env.access);
    next();
  } catch {
    next(new AppError(401, 'TOKEN_EXPIRED', 'Session expired. Please log in again.'));
  }
}

export const rbac = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new AppError(403, 'FORBIDDEN', 'You do not have access to this.'));

export function apiKey(req, _res, next) {
  if (req.headers['x-api-key'] === env.apiKey) return next();
  next(new AppError(401, 'BAD_KEY', 'Invalid API key.'));
}
