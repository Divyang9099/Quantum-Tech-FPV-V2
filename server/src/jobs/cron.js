import { Certificate, Estimate } from '../models/index.js';

async function sweep() {
  const now = new Date();
  await Estimate.updateMany({ status: 'sent', validUntil: { $lt: now } }, { status: 'expired' });
  await Certificate.updateMany({ status: 'approved', expiryDate: { $lt: now } }, { status: 'expired' });
}

// Runs at start and then hourly (no extra dependency needed for the demo).
export function startJobs() {
  sweep().catch(console.error);
  setInterval(() => sweep().catch(console.error), 3600_000).unref();
}
