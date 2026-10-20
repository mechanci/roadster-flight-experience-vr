import * as THREE from 'three';
import { buildRide, MODES } from './rides.js';
import { createWorld } from './world.js';
import { createCabin, EYE } from './cabin.js';
import { Comfort } from './comfort.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Vapor } from './vapor.js';

const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ renderer and scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');   // origin = head at session start, so seating height is whatever you sit at
renderer.xr.setFoveation(0.5);
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = createWorld(scene);
const vapor = new Vapor(scene);

// car (pivots about its centre of mass) > body (cabin + rider) > rig > camera
const car = new THREE.Group();
car.rotation.order = 'YXZ';
const body = new THREE.Group();
body.position.y = -0.5;
car.add(body);
scene.add(car);

const cabin = createCabin();
body.add(cabin.group);

const rig = new THREE.Group();
rig.position.copy(EYE);
body.add(rig);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 2000);
camera.rotation.order = 'YXZ';
rig.add(camera);

const comfort = new Comfort(camera);
const audio = new Audio();
const ui = new UI(cabin);

// ------------------------------------------------------------------ controllers
const controllers = [];
const raycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0x7fe3ff }));
  ray.scale.z = 1.2;
  c.add(ray);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  c.add(tip);
  c.userData.ray = ray;
  c.addEventListener('connected', e => { c.userData.gamepad = e.data.gamepad; });
  c.addEventListener('selectstart', () => onSelect(c));
  c.addEventListener('squeezestart', () => { if (app.state === 'ride') abortRide(); });
  rig.add(c);
  controllers.push(c);
}

function pulse(intensity, ms) {
  for (const c of controllers) {
    const gp = c.userData.gamepad;
    if (!gp) continue;
    const h = gp.hapticActuators && gp.hapticActuators[0];
    try {
      if (h && h.pulse) h.pulse(intensity, ms);
      else if (gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (e) { /* haptics are optional */ }
  }
}

// ------------------------------------------------------------------ app state
const app = {
  state: 'menu',           // menu | ride | card
  ride: null, rideT: 0,
  prevT: 0, thrustUsed: 0,
  frozen: false,           // ?seek= debug
  lastCount: -1,
  prevS: 0, prevY: 0,
  hapticT: 0,
  uiT: 0,
  emitAcc: 0, jetAcc: 0, splash: false,
};
window.__app = app;
app.finishRide = () => finishRide();
app.comfort = comfort;

if (params.get('ride') === 'hop' || params.get('ride') === 'drop') ui.sel.ride = params.get('ride');
if (MODES[params.get('mode')]) ui.sel.mode = params.get('mode');

function refreshPreview() {
  app.ride = buildRide(ui.sel.ride, ui.sel.mode);
  world.configureForRide(app.ride);
}

function startRide() {
  audio.init();
  refreshPreview();
  app.state = 'ride';
  app.rideT = 0; app.prevT = -0.001; app.thrustUsed = 0; app.lastCount = -1;
  app.prevS = 0; app.prevY = 0;
  vapor.clear();
  ui.hide();
}

function finishRide() {
  const st = app.ride.stats;
  ui.result = { peakG: st.peakG, flightTime: st.flightTime, peakHeight: st.peakHeight, maxRate: st.maxRateDegPerSec };
  app.state = 'card';
  audio.silence();
  ui.show('card');
}

function abortRide() {
  app.state = 'menu';
  audio.silence();
  vapor.clear();
  refreshPreview();
  ui.show('menu');
}

function showMenu() {
  app.state = 'menu';
  vapor.clear();
  refreshPreview();
  ui.show('menu');
}

function onAction(id) {
  if (!id) return;
  audio.init(); audio.click();
  if (id.startsWith('ride:')) { ui.sel.ride = id.slice(5); ui.drawPanel(); refreshPreview(); }
  else if (id.startsWith('mode:')) { ui.sel.mode = id.slice(5); ui.drawPanel(); }
  else if (id === 'start' || id === 'replay') startRide();
  else if (id === 'menu') showMenu();
}

function panelHit(raycasterObj) {
  if (!cabin.panel.visible) return null;
  const hit = raycasterObj.intersectObject(cabin.panel, false)[0];
  if (!hit || !hit.uv) return null;
  return { id: ui.hitTest(hit.uv.x, hit.uv.y), dist: hit.distance };
}

function controllerRay(c) {
  tmpMat.identity().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
  raycaster.camera = camera;
  return raycaster;
}

function onSelect(c) {
  if (app.state === 'ride') return;
  const h = panelHit(controllerRay(c));
  if (h) onAction(h.id);
}

// ------------------------------------------------------------------ desktop preview input
const pointer = new THREE.Vector2();
let look = { yaw: 0, pitch: 0 }, drag = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  pointer.set((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      look.yaw = Math.max(-1.6, Math.min(1.6, look.yaw - dx * 0.004));
      look.pitch = Math.max(-0.9, Math.min(0.9, look.pitch - dy * 0.004));
      drag.x = e.clientX; drag.y = e.clientY;
    }
  }
});
canvas.addEventListener('pointerup', e => {
  if (drag && !drag.moved && !renderer.xr.isPresenting) {
    raycaster.setFromCamera(pointer, camera);
    const h = panelHit(raycaster);
    if (h) onAction(h.id);
  }
  drag = null;
});
window.addEventListener('keydown', e => {
  if (renderer.xr.isPresenting) return;
  if (e.key === 'Enter' && app.state !== 'ride') onAction(app.state === 'card' ? 'replay' : 'start');
  if (e.key === 'Escape') { if (app.state === 'ride') abortRide(); else showMenu(); }
});

// ------------------------------------------------------------------ Enter VR
const vrBtn = $('enter-vr'), note = $('vr-note');
async function setupVRButton() {
  const supported = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!supported) {
    vrBtn.textContent = 'VR not available here';
    vrBtn.disabled = true;
    note.textContent = 'Open this page in the Meta Quest Browser to ride. Desktop preview below: drag to look, click the panel, Esc for menu.';
    return;
  }
  vrBtn.disabled = false;
  vrBtn.textContent = 'Enter VR';
  vrBtn.onclick = async () => {
    audio.init();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      session.addEventListener('end', () => { $('overlay').style.display = ''; audio.silence(); });
      await renderer.xr.setSession(session);
      $('overlay').style.display = 'none';
      try {
        const rates = session.supportedFrameRates;
        if (rates && session.updateTargetFrameRate) await session.updateTargetFrameRate(rates.includes(90) ? 90 : Math.max(...rates));
      } catch (e) { /* optional */ }
    } catch (err) {
      note.textContent = 'Could not start VR: ' + err.message;
    }
  };
}
setupVRButton();
$('preview').onclick = () => { $('overlay').style.display = 'none'; audio.init(); };

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ main loop
let lastTs = 0, elapsed = 0;
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), carVel = new THREE.Vector3(), emDir = new THREE.Vector3();
const em = (p, d) => ({ p: new THREE.Vector3(...p), d: new THREE.Vector3(...d).normalize() });
// main thrusters point down out of the underbody; two vents sit by the doors so plumes show at the cabin's sides
const PLUMES = [em([-0.6, 0.15, 1.4], [0, -1, 0]), em([0.6, 0.15, 1.4], [0, -1, 0]), em([-0.6, 0.15, -1.4], [0, -1, 0]),
  em([0.6, 0.15, -1.4], [0, -1, 0]), em([-1.0, 0.3, 0.2], [-0.55, -0.85, 0]), em([1.0, 0.3, 0.2], [0.55, -0.85, 0])];
// rear nozzles for the standing start: they fire backwards
const REAR = [em([-0.5, 0.35, 2.0], [0, 0.04, 1]), em([0.5, 0.35, 2.0], [0, 0.04, 1]), em([-0.2, 0.35, 2.0], [0, 0.04, 1]), em([0.2, 0.35, 2.0], [0, 0.04, 1])];
const JETS = [em([-0.95, 0.5, 1.5], [-0.8, 0.6, 0]), em([0.95, 0.5, 1.5], [0.8, -0.6, 0]),
  em([-0.95, 0.5, -1.5], [-0.8, -0.6, 0]), em([0.95, 0.5, -1.5], [0.8, 0.6, 0])];
const IDLE = { s: 0, y: 0, pitch: 0, roll: 0, speed: 0, f: 1, gFwd: 0, thrust: 0, phase: 0, rate: 0 };

// debug: ?cam=x,y,z&look=x,y,z renders from a fixed outside camera (for checking models)
let dbgCam = null;
if (params.get('cam')) {
  dbgCam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  dbgCam.position.set(...params.get('cam').split(',').map(Number));
  dbgCam.lookAt(...(params.get('look') || '0,0,0').split(',').map(Number));
}

refreshPreview();
ui.show('menu');

if (params.get('autostart')) startRide();
const seek = parseFloat(params.get('seek'));
if (!Number.isNaN(seek)) { app.frozen = true; startRide(); app.rideT = seek; app.prevT = seek; }

function crossed(t) { return app.prevT < t && app.rideT >= t; }

function frame(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
  lastTs = ts;
  elapsed += dt;
  const time = elapsed;

  let s = IDLE;
  const active = app.state === 'ride';

  if (active) {
    if (!app.frozen) app.rideT += dt * (parseFloat(params.get('speed')) || 1);
    const ev = app.ride.events;

    // events: sound, haptics
    const left = ev.move - app.rideT;
    if (left > 0 && left <= 3) {
      const n = Math.ceil(left);
      if (n !== app.lastCount) { app.lastCount = n; audio.beep(880); }
    }
    if (crossed(ev.move)) audio.beep(1320, 0.25, 0.2);
    if (crossed(0.4)) audio.click();
    for (const k of ['launch', 'brake']) if (ev[k] !== undefined && crossed(ev[k])) { audio.thump(1); pulse(1, 120); }
    if (ev.edge !== undefined && crossed(ev.edge)) { audio.thump(0.4); audio.click(); }   // suction lets go
    if (crossed(ev.touch)) { audio.thump(0.8); pulse(1, 200); app.splash = true; }
    app.prevT = app.rideT;

    if (app.rideT >= app.ride.duration && !app.frozen) { finishRide(); }
    s = app.ride.sample(Math.min(app.rideT, app.ride.duration - 0.01));
  } else {
    s = IDLE;
  }
  const mode = MODES[ui.sel.mode];
  const act = app.state === 'ride';

  // pose
  comfort.update(dt, s, mode, act, time);
  // on the ramp the car rides the track surface, so it pivots about its wheels; in the air it pivots about its centre of mass
  const onTrack = s.phase === 9 || s.phase === 10;
  const pivot = onTrack ? 0 : 0.5;
  body.position.y = -pivot;
  car.position.set(comfort.shake.x, s.y + pivot + comfort.shake.y, -s.s + comfort.shake.z);
  car.rotation.set(s.pitch + comfort.shake.rx, 0, s.roll + comfort.shake.rz);
  rig.position.set(EYE.x, EYE.y + comfort.push.y, EYE.z + comfort.push.z);
  cabin.yoke.rotation.z = act ? Math.sin(time * 1.3) * 0.02 + Math.sin(time * 3.1) * 0.006 : 0;

  // look controls on desktop
  if (!renderer.xr.isPresenting) camera.rotation.set(look.pitch, look.yaw, 0);

  // vapor
  car.updateMatrixWorld(true);
  const dts = Math.max(dt, 1e-3);
  carVel.set(0, (s.y - app.prevY) / dts, -(s.s - app.prevS) / dts);
  app.prevS = s.s; app.prevY = s.y;
  if (act) {
    body.getWorldQuaternion(tmpQ);
    if (s.thrust > 0.05) {
      app.thrustUsed += s.thrust * dt / 9;            // illustrative tank gauge
      const set = s.phase === 1 ? REAR : PLUMES;      // standing start: rear nozzles; otherwise the underbody ones
      app.emitAcc += s.thrust * 90 * dt * set.length;
      while (app.emitAcc >= 1) {
        app.emitAcc -= 1;
        const e = set[Math.floor(Math.random() * set.length)];
        tmpV.copy(e.p); body.localToWorld(tmpV);
        emDir.copy(e.d).applyQuaternion(tmpQ);
        vapor.emit(tmpV, emDir, 9 + Math.random() * 7, carVel, 1.3, 2.5);
      }
    }
    if (s.jets > 0.1) {                                // attitude jets while the car rolls or flips
      app.jetAcc += s.jets * 60 * dt * JETS.length;
      while (app.jetAcc >= 1) {
        app.jetAcc -= 1;
        const e = JETS[Math.floor(Math.random() * JETS.length)];
        tmpV.copy(e.p); body.localToWorld(tmpV);
        emDir.copy(e.d).applyQuaternion(tmpQ);
        vapor.emit(tmpV, emDir, 5 + Math.random() * 4, carVel, 0.7, 1.5);
      }
    }
    if (app.splash) {                                  // ground-level burst at touchdown
      app.splash = false;
      for (let k = 0; k < 90; k++) {
        const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.6;
        tmpV.set(Math.cos(a) * r, 0.15, -s.s + Math.sin(a) * r);
        emDir.set(Math.cos(a), 0.08, Math.sin(a));
        vapor.emit(tmpV, emDir, 5 + Math.random() * 5, carVel.set(0, 0, 0), 1.2, 1.2);
      }
    }
  }
  vapor.update(dt);
  vapor.material.uniforms.uScale.value = renderer.xr.isPresenting ? 650 : renderer.domElement.height * 0.5 / Math.tan((camera.fov * Math.PI / 180) / 2);

  // haptics: continuous rumble while thrusting
  if (act && s.thrust > 0.05 && time - app.hapticT > 0.06) { pulse(Math.min(1, 0.2 + s.thrust * 0.7), 70); app.hapticT = time; }

  // audio
  audio.update(s, act);

  // canvases at ~15 Hz
  if (time - app.uiT > 0.066) {
    app.uiT = time;
    const sample = act ? s : null;
    ui.drawHud(sample, app.rideT, app.ride, act);
    ui.drawScreen(sample, app.rideT, app.ride, act, app.thrustUsed);
  }

  // controller rays + hover
  if (!act) {
    let hover = null;
    if (renderer.xr.isPresenting) {
      for (const c of controllers) {
        const h = panelHit(controllerRay(c));
        c.userData.ray.visible = cabin.panel.visible;
        c.userData.ray.scale.z = h ? Math.max(0.1, h.dist) : 1.2;
        if (h && h.id) hover = h.id;
      }
    } else {
      raycaster.setFromCamera(pointer, camera);
      const h = panelHit(raycaster);
      if (h) hover = h.id;
    }
    ui.setHover(hover);
  } else {
    for (const c of controllers) c.userData.ray.visible = false;
  }

  renderer.render(scene, dbgCam || camera);
}
renderer.setAnimationLoop(frame);
