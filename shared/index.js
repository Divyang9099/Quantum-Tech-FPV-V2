// Rules shared by the server and the portal.

export const STAGES = ['booked', 'checked_in', 'flight_completed', 'report_delivered'];
export const STAGE_LABEL = {
  booked: 'Booked', checked_in: 'Pilot checked in', flight_completed: 'Flight completed',
  report_delivered: 'Report delivered', cancelled: 'Cancelled',
};
// Which role may move a booking INTO a stage.
export const STAGE_ROLES = {
  checked_in: ['pilot', 'office', 'admin'],
  flight_completed: ['pilot', 'office', 'admin'],
  report_delivered: ['office', 'admin'],
};

export function nextStage(stage) {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

const n = (v) => Number(v) || 0;
const round = (v) => Math.round(v * 100) / 100;

/**
 * Estimate calculator (pure). Same function runs in the live panel and on save.
 * direct = pilots + co-pilots + drones + travel + hotel + food + software + report
 * overhead, contingency = direct x %   |   margin applies on the subtotal   |   then tax
 */
export function calculateEstimate(i = {}) {
  const days = n(i.flightDays);
  const pilots = n(i.pilots) * n(i.pilotRate) * days;
  const copilots = n(i.copilots) * n(i.copilotRate) * days;
  const drones = n(i.drones) * n(i.droneRate) * days;
  const travel = n(i.ratePerKm) * n(i.distanceKm) * Math.max(n(i.trips), 0) + n(i.dailyTravel) * days;
  const hotel = n(i.hotelNights) * n(i.hotelRate);
  const food = n(i.teamSize) * n(i.foodPerDay) * days;
  const software = n(i.softwareCost);
  const report = n(i.reportHours) * n(i.reportRate) + n(i.dataStorage);

  const direct = pilots + copilots + drones + travel + hotel + food + software + report;
  const overhead = (direct * n(i.overheadPct)) / 100;
  const contingency = (direct * n(i.contingencyPct)) / 100;
  const subtotal = direct + overhead + contingency;
  const margin = (subtotal * n(i.marginPct)) / 100;
  const beforeGst = subtotal + margin;
  const gst = (beforeGst * n(i.taxPct)) / 100;
  const grand = beforeGst + gst;
  const totalDays = days + n(i.postDays);

  return {
    lines: { pilots, copilots, drones, travel, hotel, food, software, report },
    direct: round(direct), overhead: round(overhead), contingency: round(contingency),
    subtotal: round(subtotal), margin: round(margin), beforeGst: round(beforeGst),
    gst: round(gst), grand: round(grand), perDay: totalDays ? round(grand / totalDays) : 0,
  };
}

export const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
