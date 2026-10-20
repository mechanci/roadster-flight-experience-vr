// Prints headline numbers for every ride/mode so tuning changes can be checked without a headset.
// Usage: node tools/check-rides.mjs
import { buildRide, MODES } from '../js/rides.js';

const rows = [];
for (const kind of ['drop', 'hop']) {
  for (const mode of Object.keys(MODES)) {
    const r = buildRide(kind, mode);
    const st = r.stats, e = r.events;
    rows.push({
      ride: kind, mode,
      peakG: +st.peakG.toFixed(2),
      peakHeight_m: +st.peakHeight.toFixed(1),
      flight_s: +st.flightTime.toFixed(2),
      maxRot_degPerS: Math.round(st.maxRateDegPerSec),
      distance_m: Math.round(st.distance),
      duration_s: +st.duration.toFixed(1),
      touchdown_y: +r.sample(e.touch + 0.05).y.toFixed(3),
    });
  }
}
console.table(rows);
const hop = buildRide('hop', 'gentle');
console.log('hop: height > 2.2 m between s =', hop.airSpan(2.2)?.map(v => v.toFixed(1)).join(' .. '));
