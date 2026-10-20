// Ride kinematics. Pure maths, no three.js, so tools/check-rides.mjs can run it in Node.
//
// Car-local convention: the car travels along -Z in the world. `s` is the distance travelled
// (world z = -s), `y` is the height of the car origin above the ground at z=0.
// Each ride is simulated once at start-up and baked into a table, then sampled by time.
//
// Source figures (press coverage of the 15-16 Oct 2026 unveil, not verified at source):
// ~3.3 g peak on braking, >80 kN thrust, flight lasts seconds. Everything else (heights,
// speeds, timings) is invented for the experience and tuned for comfort.

export const G = 9.80665;

export const PHASES = ['STANDBY', 'ACCELERATING', 'CRUISE', 'THRUSTERS: LAUNCH', 'AIRBORNE',
  'THRUSTERS: BRAKE', 'TOUCHDOWN', 'ROLLOUT', 'PARKED'];
const P = { WAIT: 0, ACCEL: 1, CRUISE: 2, LAUNCH: 3, AIR: 4, BRAKE: 5, SETTLE: 6, ROLL: 7, HOLD: 8 };

export const MODES = {
  gentle:   { label: 'Gentle',   pitchBump: 8,  roll: 0,  flip: false, dropPitch: 4,  vignette: 1.0,  shake: 0.45 },
  standard: { label: 'Standard', pitchBump: 28, roll: 4,  flip: false, dropPitch: 10, vignette: 0.8,  shake: 0.8 },
  intense:  { label: 'Intense',  pitchBump: 0,  roll: 10, flip: true,  dropPitch: 16, vignette: 0.55, shake: 1.0 },
};

export const RIDES = {
  drop: { label: 'A  Ramp drop', blurb: 'Drive off the ramp edge. Thrusters brake the fall.' },
  hop:  { label: 'B  Car hop',   blurb: 'Thrusters launch the car over a row of cars.' },
};

const DT = 1 / 240;
const V_CRUISE = 14;       // m/s, about 50 km/h: calm on purpose
const T_WAIT = 4;          // countdown before moving
const T_ACC = 6;
const T_ROLL = 5;
const F_LAUNCH = 3.1;      // felt g at launch
const F_BRAKE = 3.3;       // felt g braking, the figure shown on Tesla's telemetry
const S_LAUNCH = 62;       // hop: distance at which launch thrust starts
const RAMP = { s0: 20, s1: 70, edge: 84, height: 9 }; // drop: ramp start, top reached, edge, height

const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

function terrain(kind, s) {
  if (kind !== 'drop') return { h: 0, h1: 0, h2: 0 };
  const L = RAMP.s1 - RAMP.s0;
  const x = (s - RAMP.s0) / L;
  if (x <= 0) return { h: 0, h1: 0, h2: 0 };
  if (s >= RAMP.edge) return { h: 0, h1: 0, h2: 0 }; // beyond the edge: ground level
  if (x >= 1) return { h: RAMP.height, h1: 0, h2: 0 };
  return {
    h: RAMP.height * (6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3),
    h1: RAMP.height * 30 * x * x * (1 - x) ** 2 / L,
    h2: RAMP.height * 60 * x * (1 - x) * (1 - 2 * x) / (L * L),
  };
}

export function buildRide(kind, modeKey) {
  const mode = MODES[modeKey] || MODES.gentle;
  const N_FIELDS = 9; // s, y, pitch, roll, speed, f, gFwd, thrust, phase
  const rows = [];
  let t = 0, s = 0, y = 0, vs = 0, vy = 0, phase = P.WAIT, tPhase = 0;
  let bumpT = -1, airborne = false;
  const ev = {};

  const setPhase = (p, key) => { phase = p; tPhase = t; if (key) ev[key] = t; };

  for (let i = 0; i < 240 * 60 && phase !== 99; i++) {
    let f = 1, ax = 0, thrust = 0, ay = 0;

    switch (phase) {
      case P.WAIT:
        if (t >= T_WAIT) setPhase(P.ACCEL, 'move');
        break;
      case P.ACCEL: {
        const u = (t - tPhase) / T_ACC;
        ax = (V_CRUISE * Math.PI / (2 * T_ACC)) * Math.sin(Math.PI * Math.min(1, u));
        vs += ax * DT;
        if (u >= 1) { vs = V_CRUISE; setPhase(P.CRUISE); }
        break;
      }
      case P.CRUISE:
        if (kind === 'hop' && s >= S_LAUNCH) { setPhase(P.LAUNCH, 'launch'); continue; }
        if (kind === 'drop' && s >= RAMP.edge) { airborne = true; vy = 0; setPhase(P.AIR, 'edge'); continue; }
        break;
      case P.LAUNCH: {
        const u = (t - tPhase) / 0.55;
        const env = smooth(Math.min(u / 0.2, (1 - u) / 0.2, 1));
        const thrustUp = F_LAUNCH * G * env;
        thrust = env;
        if (thrustUp > G) airborne = true;
        if (airborne) { ay = thrustUp - G; f = thrustUp / G; }
        else { f = Math.max(1, thrustUp / G); }
        if (u >= 1) setPhase(P.AIR);
        break;
      }
      case P.AIR:
        ay = -G; f = 0;
        // Start braking so that a constant (F_BRAKE-1) g net deceleration just stops the fall.
        if (vy < 0 && vy * vy >= 2 * (F_BRAKE - 1) * G * Math.max(y, 0.01) * 0.72) { setPhase(P.BRAKE, 'brake'); continue; }
        break;
      case P.BRAKE: {
        const ramp = smooth((t - tPhase) / 0.08);
        const thrustUp = F_BRAKE * G * ramp;
        ay = thrustUp - G; f = thrustUp / G; thrust = ramp;
        if (vy >= -0.4) setPhase(P.SETTLE);
        break;
      }
      case P.SETTLE:
        ay = Math.max(-G, Math.min(G, (-0.4 - vy) / 0.15));
        f = (ay + G) / G; thrust = 0.3;
        break;
      case P.ROLL: {
        const u = (t - tPhase) / T_ROLL;
        ax = -(V_CRUISE * Math.PI / (2 * T_ROLL)) * Math.sin(Math.PI * Math.min(1, u));
        vs += ax * DT;
        if (u >= 1) { vs = 0; setPhase(P.HOLD); }
        break;
      }
      case P.HOLD:
        if (t - tPhase >= 1.0) { ev.end = t; phase = 99; }
        break;
    }

    const grounded = !airborne;
    if (grounded) {
      const tr = terrain(kind, s);
      vy = tr.h1 * vs;
      ay = tr.h2 * vs * vs + tr.h1 * ax;
      y = tr.h;
      f = Math.max(0.6, 1 + ay / G);
    } else {
      vy += ay * DT;
      y += vy * DT;
      if ((phase === P.BRAKE || phase === P.SETTLE || phase === P.AIR) && y <= 0 && vy < 0) {
        y = 0; vy = 0; bumpT = t; ev.touch = t; airborne = false;
        setPhase(P.ROLL);
      }
    }
    s += vs * DT;

    // short bump on touchdown
    if (bumpT >= 0 && t - bumpT < 0.5) f += 0.3 * Math.exp(-(t - bumpT) / 0.12);

    const pitchBase = !airborne ? Math.atan(terrain(kind, s).h1) : 0;
    rows.push([s, y, pitchBase, 0, vs, f, ax / G, thrust, phase === 99 ? P.HOLD : phase]);
    t += DT;
  }
  if (ev.end === undefined) ev.end = t;

  // Attitude during flight, added on top of the ground-following pitch.
  const t0 = kind === 'hop' ? ev.launch : ev.edge;
  const t1 = ev.touch;
  const deg = Math.PI / 180;
  for (let i = 0; i < rows.length; i++) {
    const ti = i * DT;
    if (ti < t0 || ti > t1) continue;
    const u = (ti - t0) / (t1 - t0);
    if (kind === 'hop') {
      if (mode.flip) {
        rows[i][2] += -2 * Math.PI * smooth((u - 0.14) / 0.72);
      } else {
        rows[i][2] += mode.pitchBump * deg * Math.sin(2 * Math.PI * u);
      }
      rows[i][3] += mode.roll * deg * Math.sin(2 * Math.PI * u);
    } else {
      rows[i][2] += -mode.dropPitch * deg * Math.sin(Math.PI * u);
      rows[i][3] += mode.roll * 0.4 * deg * Math.sin(2 * Math.PI * u);
    }
  }

  return new Ride(kind, modeKey, rows, ev, N_FIELDS);
}

export class Ride {
  constructor(kind, modeKey, rows, events, nFields) {
    this.kind = kind;
    this.modeKey = modeKey;
    this.mode = MODES[modeKey];
    this.events = events;
    this.dt = DT;
    this.n = rows.length;
    this.nf = nFields;
    this.data = new Float32Array(rows.length * nFields);
    rows.forEach((r, i) => this.data.set(r, i * nFields));
    this.duration = events.end;
    this._out = { s: 0, y: 0, pitch: 0, roll: 0, speed: 0, f: 1, gFwd: 0, thrust: 0, phase: 0, rate: 0 };
    this.stats = this._stats();
  }

  sample(t) {
    const o = this._out, nf = this.nf, d = this.data;
    const x = Math.min(Math.max(t, 0) / this.dt, this.n - 1.001);
    const i = Math.floor(x), a = x - i;
    const b0 = i * nf, b1 = b0 + nf;
    const L = k => d[b0 + k] * (1 - a) + d[b1 + k] * a;
    o.s = L(0); o.y = L(1); o.pitch = L(2); o.roll = L(3); o.speed = L(4);
    o.f = L(5); o.gFwd = L(6); o.thrust = L(7); o.phase = d[b0 + 8];
    // angular rate (rad/s) from neighbouring samples, 0.05 s apart
    const step = Math.max(1, Math.round(0.05 / this.dt));
    const ia = Math.max(0, i - step), ib = Math.min(this.n - 1, i + step);
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)); // a full flip ends at -2*pi, same attitude as 0
    const dp = wrap(d[ib * nf + 2] - d[ia * nf + 2]), dr = d[ib * nf + 3] - d[ia * nf + 3];
    o.rate = Math.hypot(dp, dr) / ((ib - ia) * this.dt);
    return o;
  }

  /** Felt vertical g at time t, without touching the shared sample object. */
  fAt(t) {
    const i = Math.min(this.n - 1, Math.max(0, Math.round(t / this.dt)));
    return this.data[i * this.nf + 5];
  }

  /** Range of travel distance (s) where the car is higher than `minY` metres. */
  airSpan(minY) {
    let a = null, b = null;
    for (let i = 0; i < this.n; i++) {
      if (this.data[i * this.nf + 1] > minY) {
        const s = this.data[i * this.nf];
        if (a === null) a = s;
        b = s;
      }
    }
    return a === null ? null : [a, b];
  }

  _stats() {
    let peakF = 0, peakY = 0, maxRate = 0;
    for (let i = 0; i < this.n; i++) {
      peakF = Math.max(peakF, this.data[i * this.nf + 5]);
      peakY = Math.max(peakY, this.data[i * this.nf + 1]);
    }
    for (let t = 0; t < this.duration; t += 0.05) maxRate = Math.max(maxRate, this.sample(t).rate);
    const e = this.events;
    return {
      peakG: peakF, peakHeight: peakY,
      maxRateDegPerSec: maxRate * 180 / Math.PI,
      flightTime: e.touch - (this.kind === 'hop' ? e.launch : e.edge),
      distance: this.data[(this.n - 1) * this.nf],
      duration: this.duration,
    };
  }
}

export const RAMP_GEOMETRY = RAMP;
export const TERRAIN = terrain;
