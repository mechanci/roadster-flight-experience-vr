// Ride kinematics. Pure maths, no three.js, so tools/check-rides.mjs can run it in Node.
//
// World convention: forward travel at the start is -Z. `s` is the distance along that axis
// (world z = -s) and `y` is the height of the car origin above the ground. Each ride is
// simulated once at start-up, baked into a table and sampled by time.
//
// Ride A follows press descriptions of the unveil: the car drives up a half-circle ramp held on by
// suction fans, stops upside-down at the top, is released, rolls upright on attitude jets and is
// caught by the main thrusters. Ride B launches over a row of vehicles with a flip at the top.
// Source figures (press coverage, not verified at source): ~3.3 g on the braking telemetry, >80 kN
// thrust, suction ~2 g (Tesla claim). Heights, speeds and timings are invented and tuned for comfort.

export const G = 9.80665;

export const PHASES = ['STANDBY', 'ACCELERATING', 'CRUISE', 'THRUSTERS: LAUNCH', 'AIRBORNE',
  'THRUSTERS: BRAKE', 'TOUCHDOWN', 'ROLLOUT', 'PARKED', 'SUCTION: CLIMBING', 'SUCTION: INVERTED HOLD'];
const P = { WAIT: 0, ACCEL: 1, CRUISE: 2, LAUNCH: 3, AIR: 4, BRAKE: 5, SETTLE: 6, ROLL: 7, HOLD: 8, RAMP: 9, TOP: 10 };

export const MODES = {
  gentle:   { label: 'Gentle',   pitchBump: 8,  roll: 0,  flip: false, vignette: 1.0,  shake: 0.45, gScale: 0.6 },
  standard: { label: 'Standard', pitchBump: 28, roll: 4,  flip: false, vignette: 0.8,  shake: 0.8,  gScale: 0.8 },
  intense:  { label: 'As shown', pitchBump: 0,  roll: 10, flip: true,  vignette: 0.55, shake: 1.0,  gScale: 1.0 },
};

export const RIDES = {
  drop: { label: 'A  Curved ramp', blurb: 'Climb it upside-down, then drop.' },
  hop:  { label: 'B  Car hop',     blurb: 'Jump a row of Teslas and flip.' },
};

const DT = 1 / 240;
const T_WAIT = 4;          // countdown before moving
const T_ACC = 6;
const T_ROLL = 5;
const F_LAUNCH = 3.1;      // felt g at launch
const F_BRAKE = 3.3;       // felt g braking, the figure shown on Tesla's telemetry
const T_LAUNCH = 0.76;
const S_LAUNCH = 62;       // hop: distance at which launch thrust starts
const V_HOP = 14;          // m/s
const V_LOOP = 9.5;        // m/s on approach to the ramp: slow, so the wall ride stays comfortable
const T_TOP = 2.6;         // seconds held upside-down
const V_BACK = 4;          // peak speed of the drive-away after the drop

// Half-circle ramp, radius R, with a curvature ramp-in of length LR so the car doesn't snap into the turn.
export const LOOP = { R: 9, LR: 6, s0: 48, width: 7 };

const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

let _prof = null;
/** Centre line of the ramp surface: arrays of s (forward), y (height) and theta (pitch) every `du` metres. */
export function loopProfile() {
  if (_prof) return _prof;
  const { R, LR } = LOOP;
  const L = Math.PI * R + LR / 2;      // total turning = pi
  const du = 0.05, n = Math.ceil(L / du) + 1;
  const s = new Float32Array(n), y = new Float32Array(n), th = new Float32Array(n);
  let a = 0, x = 0, h = 0;
  for (let i = 0; i < n; i++) {
    const u = i * du;
    s[i] = x; y[i] = h; th[i] = a;
    a += (1 / R) * smooth(u / LR) * du;
    x += Math.cos(a) * du;
    h += Math.sin(a) * du;
  }
  _prof = { du, n, s, y, th, L, H: y[n - 1], S: s[n - 1] };
  return _prof;
}
const at = (arr, du, u) => {
  const x = Math.min(Math.max(u / du, 0), arr.length - 1.001);
  const i = Math.floor(x), a = x - i;
  return arr[i] * (1 - a) + arr[i + 1] * a;
};

export function buildRide(kind, modeKey) {
  const mode = MODES[modeKey] || MODES.gentle;
  const NF = 11; // s, y, pitch, roll, speed, f, gFwd, thrust, phase, fan, jets
  const rows = [];
  const prof = kind === 'drop' ? loopProfile() : null;
  let t = 0, s = 0, y = 0, vs = 0, vy = 0, phase = P.WAIT, tPhase = 0, u = 0;
  let bumpT = -1, airborne = false, pitchBase = 0;
  const ev = {};
  const V = kind === 'drop' ? V_LOOP : V_HOP;

  const setPhase = (p, key) => { phase = p; tPhase = t; if (key) ev[key] = t; };

  for (let i = 0; i < 240 * 90 && phase !== 99; i++) {
    let f = 1, ax = 0, thrust = 0, ay = 0, fan = 0, custom = false;

    switch (phase) {
      case P.WAIT:
        if (t >= T_WAIT) setPhase(P.ACCEL, 'move');
        break;
      case P.ACCEL: {
        const k = (t - tPhase) / T_ACC;
        ax = (V * Math.PI / (2 * T_ACC)) * Math.sin(Math.PI * Math.min(1, k));
        vs += ax * DT;
        if (k >= 1) { vs = V; setPhase(P.CRUISE); }
        break;
      }
      case P.CRUISE:
        if (kind === 'hop' && s >= S_LAUNCH) { setPhase(P.LAUNCH, 'launch'); continue; }
        if (kind === 'drop' && s >= LOOP.s0) { u = 0; setPhase(P.RAMP, 'ramp'); continue; }
        break;
      case P.RAMP: {
        // constant deceleration that stops the car exactly at the top of the half circle
        const v = V * Math.sqrt(Math.max(0, 1 - u / prof.L));
        const theta = at(prof.th, prof.du, u);
        const kappa = (1 / LOOP.R) * smooth(u / LOOP.LR);
        s = LOOP.s0 + at(prof.s, prof.du, u);
        y = at(prof.y, prof.du, u);
        pitchBase = theta;
        vs = v;
        f = v * v * kappa / G + Math.cos(theta);     // specific force along the car's up axis
        fan = 1;
        custom = true;
        u += v * DT;
        if (prof.L - u < 0.03) { s = LOOP.s0 + prof.S; y = prof.H; pitchBase = Math.PI; vs = 0; setPhase(P.TOP, 'top'); }
        break;
      }
      case P.TOP:
        f = -1; fan = 1; custom = true; vs = 0;
        s = LOOP.s0 + prof.S; y = prof.H; pitchBase = Math.PI;
        // From here the car rotates about its centre of mass (0.5 m above the origin when upright), so the
        // origin height is re-based: the centre of mass sits 0.5 m below the inverted track.
        if (t - tPhase >= T_TOP) { airborne = true; vy = 0; fan = 0; y = prof.H - 1.0; setPhase(P.AIR, 'edge'); continue; }
        break;
      case P.LAUNCH: {
        const k = (t - tPhase) / T_LAUNCH;
        const env = smooth(Math.min(k / 0.2, (1 - k) / 0.2, 1));
        const thrustUp = F_LAUNCH * G * env;
        thrust = env;
        if (thrustUp > G) airborne = true;
        if (airborne) { ay = thrustUp - G; f = thrustUp / G; }
        else { f = Math.max(1, thrustUp / G); }
        if (k >= 1) setPhase(P.AIR);
        break;
      }
      case P.AIR:
        ay = -G * (kind === 'drop' ? mode.gScale : 1); f = 0;   // gentler mode: slower drop
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
        if (kind === 'drop') {
          // drive off backwards, away from the ramp, then stop
          const k = (t - tPhase) / T_ROLL;
          vs = -V_BACK * Math.sin(Math.PI * Math.min(1, k));
          ax = -V_BACK * (Math.PI / T_ROLL) * Math.cos(Math.PI * Math.min(1, k));
          if (k >= 1) { vs = 0; setPhase(P.HOLD); }
        } else {
          const k = (t - tPhase) / T_ROLL;
          ax = -(V * Math.PI / (2 * T_ROLL)) * Math.sin(Math.PI * Math.min(1, k));
          vs += ax * DT;
          if (k >= 1) { vs = 0; setPhase(P.HOLD); }
        }
        break;
      }
      case P.HOLD:
        if (t - tPhase >= 1.0) { ev.end = t; phase = 99; }
        break;
    }

    if (!custom) {
      if (!airborne) { y = 0; vy = 0; f = Math.max(0.6, f); }
      else {
        vy += ay * DT;
        y += vy * DT;
        if ((phase === P.BRAKE || phase === P.SETTLE || phase === P.AIR) && y <= 0 && vy < 0) {
          y = 0; vy = 0; bumpT = t; ev.touch = t; airborne = false;
          setPhase(P.ROLL);
        }
      }
      s += vs * DT;
    }

    if (bumpT >= 0 && t - bumpT < 0.5) f += 0.3 * Math.exp(-(t - bumpT) / 0.12);

    rows.push([s, y, pitchBase, 0, Math.abs(vs), f, ax / G, thrust, phase === 99 ? P.HOLD : phase, fan, 0]);
    t += DT;
  }
  if (ev.end === undefined) ev.end = t;

  // Attitude during flight, added on top of the base pitch.
  const t0 = kind === 'hop' ? ev.launch : ev.edge;
  const t1 = ev.touch;
  const deg = Math.PI / 180;
  const smooth01 = smooth;
  for (let i = 0; i < rows.length; i++) {
    const ti = i * DT;
    if (ti < t0) continue;
    const k = Math.min(1, (ti - t0) / (t1 - t0));
    if (kind === 'hop') {
      if (ti > t1) continue;
      if (mode.flip) rows[i][2] += -2 * Math.PI * smooth01((k - 0.14) / 0.72);   // the flip at the top
      else rows[i][2] += mode.pitchBump * deg * Math.sin(2 * Math.PI * k);
      rows[i][3] += mode.roll * deg * Math.sin(2 * Math.PI * k);
    } else {
      // released upside-down: barrel roll upright on the attitude jets, finishing as the main thrusters catch it
      rows[i][3] = Math.PI * smooth01(k / 0.9);
    }
  }

  // attitude-jet activity from the angular rate, used for the side plumes
  for (let i = 1; i < rows.length - 1; i++) {
    const ti = i * DT;
    if (ti < t0 || ti > t1) continue;
    const dp = Math.atan2(Math.sin(rows[i + 1][2] - rows[i - 1][2]), Math.cos(rows[i + 1][2] - rows[i - 1][2]));
    const dr = rows[i + 1][3] - rows[i - 1][3];
    rows[i][10] = Math.min(1, Math.hypot(dp, dr) / (2 * DT) / 1.2);
  }

  return new Ride(kind, modeKey, rows, ev, NF);
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
    this._out = { s: 0, y: 0, pitch: 0, roll: 0, speed: 0, f: 1, gFwd: 0, thrust: 0, phase: 0, fan: 0, jets: 0, rate: 0 };
    const last = this.data[(this.n - 1) * nFields], atTouch = this.data[Math.round(events.touch / DT) * nFields];
    this.endS = last;
    this.endDirZ = Math.abs(last - atTouch) < 0.5 ? -1 : (last > atTouch ? -1 : 1); // world z direction of the final drive-off
    this.stats = this._stats();
  }

  sample(t) {
    const o = this._out, nf = this.nf, d = this.data;
    const x = Math.min(Math.max(t, 0) / this.dt, this.n - 1.001);
    const i = Math.floor(x), a = x - i;
    const b0 = i * nf, b1 = b0 + nf;
    const L = k => d[b0 + k] * (1 - a) + d[b1 + k] * a;
    o.s = L(0); o.y = L(1); o.pitch = L(2); o.roll = L(3); o.speed = L(4);
    o.f = L(5); o.gFwd = L(6); o.thrust = L(7); o.phase = d[b0 + 8]; o.fan = L(9); o.jets = L(10);
    // angular rate (rad/s) from neighbouring samples, 0.05 s apart
    const step = Math.max(1, Math.round(0.05 / this.dt));
    const ia = Math.max(0, i - step), ib = Math.min(this.n - 1, i + step);
    const wrap = v => Math.atan2(Math.sin(v), Math.cos(v)); // a full flip ends at -2*pi, same attitude as 0
    const dp = wrap(d[ib * nf + 2] - d[ia * nf + 2]), dr = wrap(d[ib * nf + 3] - d[ia * nf + 3]);
    o.rate = Math.hypot(dp, dr) / ((ib - ia) * this.dt);
    return o;
  }

  /** Felt vertical g at time t, without touching the shared sample object. */
  fAt(t) {
    const i = Math.min(this.n - 1, Math.max(0, Math.round(t / this.dt)));
    return this.data[i * this.nf + 5];
  }

  /** Height of the car (hop ride) at forward distance s. Zero before lift-off. */
  yAtS(s) {
    if (!this._sy) {
      this._sy = [];
      const iL = Math.round(this.events.launch / this.dt), iT = Math.round(this.events.touch / this.dt);
      for (let i = iL; i <= iT; i += 4) this._sy.push([this.data[i * this.nf], this.data[i * this.nf + 1]]);
    }
    const a = this._sy;
    if (s <= a[0][0] || s >= a[a.length - 1][0]) return 0;
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m][0] <= s) lo = m; else hi = m; }
    const k = (s - a[lo][0]) / (a[hi][0] - a[lo][0] || 1);
    return a[lo][1] * (1 - k) + a[hi][1] * k;
  }

  _stats() {
    let peakF = -9, minF = 9, peakY = 0, maxRate = 0;
    for (let i = 0; i < this.n; i++) {
      const f = this.data[i * this.nf + 5];
      peakF = Math.max(peakF, f); minF = Math.min(minF, f);
      peakY = Math.max(peakY, this.data[i * this.nf + 1]);
    }
    for (let t = 0; t < this.duration; t += 0.05) maxRate = Math.max(maxRate, this.sample(t).rate);
    const e = this.events;
    const tf0 = this.kind === 'hop' ? e.launch : e.edge;
    return {
      peakG: peakF, minG: minF, peakHeight: peakY,
      maxRateDegPerSec: maxRate * 180 / Math.PI,
      flightTime: e.touch - tf0,
      distance: this.endS,
      duration: this.duration,
    };
  }
}

/**
 * Choose where to park a row of vehicles under the hop's flight path. `specs` = [{len, h}] in reported
 * order. Slides the row along the path, and if the best clearance is too small tries reorderings.
 * Returns {order, starts (s of each vehicle's rear edge), margin} with margin = worst clearance in metres.
 */
export function planRow(ride, specs, gap = 1.0, wantMargin = 0.9) {
  const eval1 = (order, off) => {
    let s = off, margin = Infinity;
    const starts = [];
    for (const i of order) {
      const v = specs[i];
      starts.push(s);
      for (let x = s; x <= s + v.len; x += 0.5) margin = Math.min(margin, ride.yAtS(x) - v.h);
      s += v.len + gap;
    }
    return { starts, margin };
  };
  const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
  const base = specs.map((_, i) => i);
  const best = { margin: -Infinity };
  const tryOrders = [base];
  for (let pass = 0; pass < 2; pass++) {
    for (const order of tryOrders) {
      for (let off = ride.sample(ride.events.launch).s; off < ride.endS; off += 0.5) {
        const r = eval1(order, off);
        if (r.margin > best.margin) { best.margin = r.margin; best.order = order; best.starts = r.starts; }
      }
    }
    if (best.margin >= wantMargin || pass === 1) break;
    tryOrders.length = 0; tryOrders.push(...perms(base));
  }
  return best;
}

export const RAMP_GEOMETRY = LOOP;
