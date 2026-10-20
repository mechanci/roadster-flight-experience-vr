// Synthesised audio, no sample files. In this experience sound does a lot of the work of
// making acceleration feel heavy: low-frequency thrust, wind, and a muffled cabin in free-fall.
// The AudioContext must be created from a user gesture (the Enter VR / Start click).

export class Audio {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.cabin = ctx.createBiquadFilter();      // low-pass: muffles in free-fall
    this.cabin.type = 'lowpass'; this.cabin.frequency.value = 12000;
    this.cabin.connect(this.master);
    this.master.connect(ctx.destination);

    // 3 s of noise, looped
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;                  // simple pink-ish filter
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.0555; b1 = 0.985 * b1 + w * 0.0750; b2 = 0.950 * b2 + w * 0.1538;
      d[i] = (b0 + b1 + b2 + w * 0.5) * 0.5;
    }
    this.noiseBuf = buf;
    const noise = () => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };

    // electric drive whine
    this.whine = ctx.createOscillator(); this.whine.type = 'sawtooth'; this.whine.frequency.value = 120;
    const whineLP = ctx.createBiquadFilter(); whineLP.type = 'lowpass'; whineLP.frequency.value = 900;
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(whineLP).connect(this.whineGain).connect(this.cabin);
    this.whine.start();

    // road + wind
    const wind = noise();
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 500; this.windBP.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windBP).connect(this.windGain).connect(this.cabin);

    // thrusters: hiss + roar + sub rumble
    const roar = noise();
    this.roarLP = ctx.createBiquadFilter(); this.roarLP.type = 'lowpass'; this.roarLP.frequency.value = 600;
    this.roarGain = ctx.createGain(); this.roarGain.gain.value = 0;
    roar.connect(this.roarLP).connect(this.roarGain).connect(this.cabin);
    const hiss = noise();
    const hissHP = ctx.createBiquadFilter(); hissHP.type = 'highpass'; hissHP.frequency.value = 2500;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hiss.connect(hissHP).connect(this.hissGain).connect(this.cabin);
    this.sub = ctx.createOscillator(); this.sub.type = 'sine'; this.sub.frequency.value = 42;
    this.subGain = ctx.createGain(); this.subGain.gain.value = 0;
    this.sub.connect(this.subGain).connect(this.master);
    this.sub.start();

    this.on = true;
  }

  update(s, active) {
    if (!this.on) return;
    const t = this.ctx.currentTime, k = 0.06;
    const speed = active ? s.speed : 0, thr = active ? s.thrust : 0;
    const air = active && s.f < 0.2;
    this.whine.frequency.setTargetAtTime(110 + speed * 38, t, k);
    this.whineGain.gain.setTargetAtTime(active ? 0.012 + Math.min(speed / 14, 1) * 0.03 : 0, t, k);
    this.windBP.frequency.setTargetAtTime(350 + speed * 45, t, k);
    this.windGain.gain.setTargetAtTime(Math.min(speed / 14, 1) ** 2 * 0.1 + (air ? 0.03 : 0), t, k);
    this.roarLP.frequency.setTargetAtTime(450 + thr * 1800, t, 0.03);
    this.roarGain.gain.setTargetAtTime(thr * 0.55, t, 0.03);
    this.hissGain.gain.setTargetAtTime(thr * 0.22, t, 0.03);
    this.subGain.gain.setTargetAtTime(thr * 0.5, t, 0.04);
    this.cabin.frequency.setTargetAtTime(air ? 1800 : 12000, t, 0.12);
  }

  beep(freq = 880, dur = 0.09, gain = 0.15) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  click() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 2;
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random()); n.stop(t + 0.08);
  }

  thump(power = 1) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    g.gain.setValueAtTime(0.9 * power, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  silence() {
    if (!this.on) return;
    this.update({ speed: 0, thrust: 0, f: 1 }, false);
  }
}
