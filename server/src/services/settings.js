import { Setting } from '../models/index.js';

export const DEFAULT_RATES = {
  pilotRates: { 'Level 1': 6000, 'Level 2': 9000, 'Level 3': 13000, Expert: 18000 },
  droneRates: { 'FPV Cinewhoop': 3500, 'Mapping Quad': 5000, 'Tethered UAV': 12000, 'Agri Sprayer': 7000 },
  ratePerKm: 14, food: 600, hotel: 2500, reportRate: 900,
  overheadPct: 10, contingencyPct: 5, marginPct: 20, taxPct: 18,
};

export async function getRates() {
  const s = await Setting.findOne({ key: 'rateLibrary' });
  return { ...DEFAULT_RATES, ...(s?.value || {}) };
}

export async function getSetting(key, fallback) {
  const s = await Setting.findOne({ key });
  return s ? s.value : fallback;
}

export const setSetting = (key, value) => Setting.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
