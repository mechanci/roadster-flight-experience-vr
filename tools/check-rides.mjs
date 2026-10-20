// Prints headline numbers for every ride/mode so tuning changes can be checked without a headset.
// Usage: node tools/check-rides.mjs
import { buildRide, planRow, loopProfile, MODES } from '../js/rides.js';
import { VEHICLES } from '../js/vehicles.js';

const rows = [];
for (const kind of ['drop', 'hop']) {
  for (const mode of Object.keys(MODES)) {
    const r = buildRide(kind, mode);
    const st = r.stats, e = r.events;
    rows.push({
      ride: kind, mode,
      peakG: +st.peakG.toFixed(2), minG: +st.minG.toFixed(2),
      peakHeight_m: +st.peakHeight.toFixed(1),
      flight_s: +st.flightTime.toFixed(2),
      maxRot_degPerS: Math.round(st.maxRateDegPerSec),
      endS_m: Math.round(r.endS), endDirZ: r.endDirZ,
      duration_s: +st.duration.toFixed(1),
      touchdown_y: +r.sample(e.touch + 0.05).y.toFixed(3),
    });
  }
}
console.table(rows);
const lp = loopProfile();
console.log(`ramp: arc length ${lp.L.toFixed(1)} m, top height ${lp.H.toFixed(1)} m, top s offset ${lp.S.toFixed(2)} m`);
for (const mode of Object.keys(MODES)) {
  const hop = buildRide('hop', mode);
  const plan = planRow(hop, VEHICLES.map(v => ({ len: v.len, h: v.h })));
  console.log(`hop ${mode}: row order ${plan.order.map(i => VEHICLES[i].name).join(', ')}; worst clearance ${plan.margin.toFixed(2)} m`);
}
