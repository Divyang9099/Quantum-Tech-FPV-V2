import { customAlphabet } from 'nanoid';
import { Counter } from '../models/index.js';

const alpha = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
export const newBookingId = () => `QB-${alpha()}`;
export const newToken = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 24);

export async function nextCode(name, prefix, pad = 3) {
  const c = await Counter.findOneAndUpdate({ name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}${String(c.seq).padStart(pad, '0')}`;
}
