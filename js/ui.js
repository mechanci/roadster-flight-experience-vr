import { MODES, RIDES, PHASES } from './rides.js';

// Canvas-drawn UI: the menu / result panel in the windscreen, the HUD, and the centre screen.
// Buttons are plain rectangles in canvas pixels; hit-testing takes the plane's UV coordinates.

const CYAN = '#7fe3ff';
const AMBER = '#ffc23a';

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function wrap(g, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = w; y += lineH; }
    else line = test;
  }
  g.fillText(line, x, y);
  return y + lineH;
}

export class UI {
  constructor(cabin) {
    this.cabin = cabin;
    this.screen = 'menu';
    this.sel = { ride: 'drop', mode: 'gentle' };
    this.result = null;
    this.buttons = [];
    this.hover = null;
    this._hudKey = '';
  }

  // ---------------------------------------------------------------- panel
  drawPanel() {
    const c = this.cabin.panelCanvas, g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    this.buttons = [];
    g.fillStyle = 'rgba(8,10,16,0.9)'; rr(g, 0, 0, W, H, 36); g.fill();
    g.strokeStyle = 'rgba(127,227,255,0.35)'; g.lineWidth = 3; rr(g, 3, 3, W - 6, H - 6, 34); g.stroke();
    g.textBaseline = 'alphabetic';

    const button = (id, x, y, w, h, label, sub, selected, primary) => {
      const hov = this.hover === id;
      g.fillStyle = primary ? (hov ? '#a8f0ff' : CYAN) : selected ? 'rgba(127,227,255,0.22)' : hov ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)';
      rr(g, x, y, w, h, 18); g.fill();
      g.lineWidth = selected ? 4 : 2;
      g.strokeStyle = selected ? CYAN : 'rgba(255,255,255,0.25)';
      if (!primary) { rr(g, x, y, w, h, 18); g.stroke(); }
      g.fillStyle = primary ? '#04131a' : '#fff';
      g.textAlign = 'center';
      g.font = `bold ${sub ? 34 : 40}px sans-serif`;
      g.fillText(label, x + w / 2, y + (sub ? h * 0.45 : h * 0.62));
      if (sub) { g.font = '23px sans-serif'; g.fillStyle = primary ? '#04131a' : '#b8c2cc'; g.fillText(sub, x + w / 2, y + h * 0.78); }
      this.buttons.push({ id, x, y, w, h });
    };

    if (this.screen === 'menu') {
      g.textAlign = 'left';
      g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.fillText('FLIGHT TEST', 60, 90);
      g.fillStyle = CYAN; g.font = '26px sans-serif';
      g.fillText('Concept ride-along inspired by the Tesla Roadster thruster demo (Oct 2026)', 60, 130);

      g.fillStyle = '#8f9aa5'; g.font = 'bold 22px sans-serif'; g.fillText('CHOOSE YOUR FLIGHT', 60, 190);
      button('ride:drop', 60, 205, 510, 110, RIDES.drop.label, 'Drive off the edge. Thrusters brake the fall.', this.sel.ride === 'drop');
      button('ride:hop', 582, 205, 510, 110, RIDES.hop.label, 'Thrusters launch the car over a row of cars.', this.sel.ride === 'hop');

      g.fillStyle = '#8f9aa5'; g.font = 'bold 22px sans-serif'; g.textAlign = 'left'; g.fillText('COMFORT', 60, 360);
      const sub = { gentle: 'least rotation', standard: 'moderate', intense: this.sel.ride === 'hop' ? 'full flip' : 'strongest' };
      Object.keys(MODES).forEach((k, i) => button('mode:' + k, 60 + i * 354, 375, 330, 90, MODES[k].label, sub[k], this.sel.mode === k));

      button('start', 296, 495, 560, 100, 'START', null, false, true);

      g.fillStyle = '#7d8893'; g.font = '21px sans-serif'; g.textAlign = 'center';
      g.fillText('Unofficial fan concept. Not affiliated with Tesla or SpaceX. Cabin is invented; figures are from press reports.', W / 2, 640);
      g.fillText('Seated ride. Take the headset off at any time. Not for anyone prone to motion sickness.', W / 2, 676);
    } else if (this.screen === 'card') {
      const r = this.result || {};
      g.textAlign = 'left';
      g.fillStyle = '#fff'; g.font = 'bold 52px sans-serif'; g.fillText('BACK ON THE ROAD', 60, 86);
      g.fillStyle = CYAN; g.font = '28px sans-serif'; g.fillText('Spectacular is one thing. Is it ready for everyday use?', 60, 128);

      g.fillStyle = '#8f9aa5'; g.font = 'bold 22px sans-serif'; g.fillText('WHAT YOU JUST DID', 60, 188);
      const rows = [
        ['Peak load', (r.peakG || 0).toFixed(1) + ' g'],
        ['Flight time', (r.flightTime || 0).toFixed(1) + ' s'],
        ['Highest point', (r.peakHeight || 0).toFixed(1) + ' m'],
        ['Fastest spin', Math.round(r.maxRate || 0) + ' °/s'],
      ];
      rows.forEach(([k, v], i) => {
        const y = 240 + i * 62;
        g.fillStyle = '#b8c2cc'; g.font = '28px sans-serif'; g.textAlign = 'left'; g.fillText(k, 60, y);
        g.fillStyle = '#fff'; g.font = 'bold 38px sans-serif'; g.textAlign = 'right'; g.fillText(v, 430, y);
      });

      g.textAlign = 'left';
      g.fillStyle = '#8f9aa5'; g.font = 'bold 22px sans-serif'; g.fillText('WHAT DAILY USE WOULD NEED (AS REPORTED)', 500, 188);
      const bullets = [
        'Flights last seconds; the air tank (~600 L reported) must be recharged.',
        'No word yet on how thruster maneuvers would be approved for public roads.',
        'Only the top trims carry thrusters; the base car has none.',
        'About 3 g and a lot of noise: not for every passenger.',
      ];
      g.font = '26px sans-serif';
      let y = 238;
      for (const b of bullets) {
        g.fillStyle = AMBER; g.fillText('●', 500, y);
        g.fillStyle = '#e8edf1'; y = wrap(g, b, 535, y, 560, 33) + 14;
      }

      button('replay', 60, 520, 330, 90, 'Replay', null, false, true);
      button('menu', 410, 520, 330, 90, 'Menu', null, false, false);
      g.fillStyle = '#7d8893'; g.font = '20px sans-serif'; g.textAlign = 'left';
      g.fillText('Simulated feel only: VR cannot produce real g-force. Sources: press coverage of the unveil.', 60, 670);
    }
    this.cabin.panelTex.needsUpdate = true;
  }

  hitTest(u, v) {
    const c = this.cabin.panelCanvas;
    const x = u * c.width, y = (1 - v) * c.height;
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  setHover(id) {
    if (id !== this.hover) { this.hover = id; this.drawPanel(); }
  }

  show(screen) {
    this.screen = screen; this.hover = null;
    this.cabin.panel.visible = true;
    this.drawPanel();
  }
  hide() { this.cabin.panel.visible = false; }

  // ---------------------------------------------------------------- HUD (windscreen)
  drawHud(s, rideT, ride, active) {
    const e = ride ? ride.events : null;
    const speed = s ? Math.round(s.speed * 3.6) : 0;
    const f = s ? s.f : 1;
    const alt = s ? Math.max(0, s.y) : 0;
    const phase = s ? PHASES[s.phase] : '';
    let big = '';
    if (active && e && rideT < e.move) {
      const left = e.move - rideT;
      big = left > 3 ? 'READY' : String(Math.ceil(left));
    } else if (active && e && rideT < e.move + 0.9) big = 'GO';
    const key = [speed, f.toFixed(1), Math.round(alt * 2), phase, big, active].join('|');
    if (key === this._hudKey) return;
    this._hudKey = key;

    const c = this.cabin.hudCanvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (!active) { this.cabin.hudTex.needsUpdate = true; return; }
    g.textBaseline = 'alphabetic';

    if (big) {
      g.fillStyle = CYAN; g.font = 'bold 190px sans-serif'; g.textAlign = 'center';
      g.fillText(big, c.width / 2, 250);
      g.font = '30px sans-serif'; g.fillText('Squeeze a grip button at any time to stop', c.width / 2, 365);
    } else {
      const col = f > 2.5 ? AMBER : CYAN;
      g.textAlign = 'center';
      g.fillStyle = CYAN; g.font = 'bold 120px sans-serif'; g.fillText(String(speed), 200, 190);
      g.font = '34px sans-serif'; g.fillText('km/h', 200, 235);
      g.fillStyle = col; g.font = 'bold 150px sans-serif'; g.fillText(f.toFixed(1), c.width / 2, 190);
      g.font = '34px sans-serif'; g.fillText('g', c.width / 2 + 150, 190);
      // g bar
      g.strokeStyle = 'rgba(127,227,255,0.6)'; g.lineWidth = 3; g.strokeRect(c.width / 2 - 180, 215, 360, 22);
      g.fillStyle = col; g.fillRect(c.width / 2 - 178, 217, Math.min(1, f / 3.5) * 356, 18);
      g.fillStyle = CYAN; g.font = 'bold 120px sans-serif'; g.fillText(alt.toFixed(0), c.width - 200, 190);
      g.font = '34px sans-serif'; g.fillText('m above ground', c.width - 200, 235);
    }
    g.textAlign = 'center';
    g.font = 'bold 40px sans-serif';
    g.fillStyle = /THRUSTERS/.test(phase) ? AMBER : CYAN;
    g.fillText(phase, c.width / 2, 320);
    this.cabin.hudTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- centre screen
  drawScreen(s, rideT, ride, active, thrustUsed) {
    const c = this.cabin.screenCanvas, g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.fillStyle = '#0b0d11'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic';
    // status bar
    g.fillStyle = '#9aa4ae'; g.font = '24px sans-serif'; g.textAlign = 'left';
    g.fillText('ROADSTER  ·  CONCEPT', 24, 40);
    g.textAlign = 'right'; g.fillText(active ? 'D' : 'P', W - 24, 40);

    const speed = s ? Math.round(s.speed * 3.6) : 0;
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = 'bold 150px sans-serif';
    g.fillText(String(speed), 24, 190);
    g.fillStyle = '#9aa4ae'; g.font = '30px sans-serif'; g.fillText('km/h', 28, 232);

    // thruster block
    const f = s ? s.f : 1;
    g.textAlign = 'left'; g.fillStyle = '#9aa4ae'; g.font = '24px sans-serif';
    g.fillText('THRUSTERS', 360, 100);
    const firing = s && s.thrust > 0.05;
    g.fillStyle = firing ? AMBER : '#5fd38a'; g.font = 'bold 36px sans-serif';
    g.fillText(firing ? 'FIRING' : active ? 'ARMED' : 'STANDBY', 360, 142);

    g.fillStyle = '#9aa4ae'; g.font = '24px sans-serif'; g.fillText('AIR TANK (illustrative)', 360, 195);
    g.strokeStyle = '#4a5560'; g.lineWidth = 3; g.strokeRect(360, 210, 240, 26);
    const level = Math.max(0, 1 - thrustUsed);
    g.fillStyle = level < 0.4 ? AMBER : '#5fd38a'; g.fillRect(363, 213, 234 * level, 20);

    // g trace
    g.strokeStyle = '#2a3038'; g.lineWidth = 2; g.strokeRect(24, 270, W - 48, 100);
    g.fillStyle = '#9aa4ae'; g.font = '20px sans-serif'; g.textAlign = 'left'; g.fillText('LOAD', 34, 292);
    if (ride && active) {
      g.strokeStyle = CYAN; g.lineWidth = 3; g.beginPath();
      const t0 = Math.max(0, rideT - 12);
      for (let i = 0; i <= 120; i++) {
        const t = t0 + (rideT - t0) * i / 120;
        const v = ride.fAt(Math.max(0, t));
        const x = 24 + (W - 48) * i / 120, y = 370 - Math.min(1, v / 3.5) * 92;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    this.cabin.screenTex.needsUpdate = true;
  }
}
