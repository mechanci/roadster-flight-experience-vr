import * as THREE from 'three';

// An invented driver-side cabin in the spirit of Tesla's current design language: low dash,
// big landscape centre screen, yoke, glass roof. The real Roadster interior has not been shown,
// so this is a concept, not a replica. Car-local space: forward is -Z, driver on the left.

export const EYE = new THREE.Vector3(-0.36, 1.0, 0.45);

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts });

function beam(a, b, w, h, material) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  return m;
}

export function createCabin() {
  const group = new THREE.Group();

  const leather = mat(0x26262c, { roughness: 0.55 });
  const trim = mat(0x3a3c44, { roughness: 0.4, metalness: 0.3 });
  const paint = mat(0x7d1d22, { roughness: 0.32, metalness: 0.35 });
  const dash = mat(0x1a1b20, { roughness: 0.5 });
  const accent = mat(0xd9d4c8, { roughness: 0.6 });
  const glove = mat(0x17171a, { roughness: 0.8 });
  const sleeve = mat(0x1a1d24, { roughness: 0.95 });

  const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };

  // floor and tunnel
  add(new THREE.BoxGeometry(1.5, 0.05, 3.0), dash, 0, 0.28, 0.2);
  add(new THREE.BoxGeometry(0.26, 0.24, 1.0), trim, 0, 0.42, 0.15);
  add(new THREE.BoxGeometry(0.2, 0.02, 0.3), accent, 0, 0.555, 0.0);

  // seats (driver + passenger)
  for (const x of [-0.36, 0.36]) {
    add(new THREE.BoxGeometry(0.52, 0.1, 0.52), leather, x, 0.42, 0.55);
    add(new THREE.BoxGeometry(0.52, 0.66, 0.12), leather, x, 0.74, 0.82, 0.2);
    add(new THREE.BoxGeometry(0.26, 0.2, 0.1), leather, x, 1.14, 0.93, 0.2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.4, 0.5), leather, x + s * 0.27, 0.62, 0.78, 0.2); // bolsters
  }
  // rear bench shelf (2+2)
  add(new THREE.BoxGeometry(1.4, 0.3, 0.5), leather, 0, 0.5, 1.6);

  // harness straps over the driver's shoulders (visible at the edge of view when you look down)
  const strap = mat(0x8a1a1a, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    group.add(beam(new THREE.Vector3(-0.36 + s * 0.17, 1.12, 0.84), new THREE.Vector3(-0.36 - s * 0.05, 0.62, 0.42), 0.055, 0.012, strap));
  }

  // dashboard
  add(new THREE.BoxGeometry(1.56, 0.14, 0.5), dash, 0, 0.77, -0.33);
  add(new THREE.BoxGeometry(1.52, 0.03, 0.08), accent, 0, 0.855, -0.14);
  add(new THREE.BoxGeometry(1.56, 0.3, 0.06), dash, 0, 0.62, -0.06); // lower fascia

  // hood with a crown and drop-off, plus fender humps
  {
    const g = new THREE.BoxGeometry(1.7, 0.1, 2.1, 12, 1, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const zn = (z + 1.05) / 2.1;                 // 0 at the back, 1 at the nose
      p.setY(i, p.getY(i) + 0.1 * (1 - (x / 0.85) ** 2) - 0.2 * zn * zn);
    }
    g.computeVertexNormals();
    add(g, paint, 0, 0.82, -1.65);
    for (const s of [-1, 1]) {
      const h = add(new THREE.SphereGeometry(0.34, 16, 10), paint, s * 0.78, 0.8, -1.8);
      h.scale.set(0.55, 0.38, 1.7);
    }
  }

  // doors, armrests, mirrors
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.52, 1.4), leather, s * 0.77, 0.6, 0.35);
    add(new THREE.BoxGeometry(0.12, 0.07, 1.5), trim, s * 0.76, 0.88, 0.3);
    add(new THREE.BoxGeometry(0.1, 0.05, 0.45), leather, s * 0.68, 0.82, 0.4);
    const mir = add(new THREE.BoxGeometry(0.05, 0.09, 0.2), dash, s * 0.9, 0.98, -0.55);
    mir.rotation.y = s * 0.3;
  }

  // A-pillars, header, roof rails, glass roof
  const framePts = (x, y0, z0, y1, z1) => [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x * 0.96, y1, z1)];
  for (const s of [-1, 1]) {
    const [a, b] = framePts(s * 0.76, 0.86, -0.7, 1.22, -0.2);
    group.add(beam(a, b, 0.04, 0.035, trim));
  }
  group.add(beam(new THREE.Vector3(-0.73, 1.22, -0.2), new THREE.Vector3(0.73, 1.22, -0.2), 0.04, 0.03, trim));
  {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ color: 0x223044, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, 1.21, 0.9);
    group.add(glass);
  }
  add(new THREE.BoxGeometry(0.28, 0.06, 0.04), dash, 0.04, 1.14, -0.24); // rear-view mirror

  // interior fill so the dark materials stay readable at dusk
  const fill = new THREE.PointLight(0xffe6cc, 1.6, 4, 2);
  fill.position.set(-0.1, 1.1, 0.35);
  group.add(fill);

  // ---- centre screen --------------------------------------------------------------------
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 640; screenCanvas.height = 400;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Group();
  screen.position.set(0, 0.95, -0.45);
  screen.rotation.order = 'YXZ';
  screen.rotation.set(0.14, -0.42, 0);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.29, 0.025), dash);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.269), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  face.position.z = 0.0135;
  screen.add(bezel, face);
  group.add(screen);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), dash);
  stem.position.set(0, 0.88, -0.46);
  group.add(stem);

  // ---- yoke, hands, arms ----------------------------------------------------------------
  const yoke = new THREE.Group();
  yoke.position.set(EYE.x, 0.85, 0.06);
  yoke.rotation.x = -0.45;
  group.add(yoke);
  {
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), leather);
    yoke.add(hub);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), trim);
    bar.rotation.z = Math.PI / 2; bar.position.y = 0.05;
    yoke.add(bar);
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.13, 6, 10), leather);
      grip.position.set(s * 0.18, 0.02, 0);
      yoke.add(grip);
      const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.07, 6, 10), glove);
      hand.position.set(s * 0.18, 0.02, 0.0);
      hand.scale.set(1.0, 1.0, 1.25);
      yoke.add(hand);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 4, 6), glove);
      thumb.position.set(s * 0.18, 0.075, 0.02);
      yoke.add(thumb);
    }
  }
  const column = beam(new THREE.Vector3(EYE.x, 0.82, 0.05), new THREE.Vector3(EYE.x, 0.72, -0.3), 0.06, 0.06, dash);
  group.add(column);
  // forearms from the grips back towards the shoulders
  for (const s of [-1, 1]) {
    const hand = new THREE.Vector3(EYE.x + s * 0.18, 0.84, 0.1);
    const elbow = new THREE.Vector3(EYE.x + s * 0.3, 0.62, 0.5);
    const arm = beam(hand, elbow, 0.045, 0.045, sleeve);
    group.add(arm);
  }

  // ---- HUD projected on the windscreen (additive, reads like a heads-up display) --------
  const hudCanvas = document.createElement('canvas');
  hudCanvas.width = 1024; hudCanvas.height = 384;
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2325), new THREE.MeshBasicMaterial({
    map: hudTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  }));
  hud.position.set(EYE.x, 0.95, -0.75);
  hud.renderOrder = 5;
  group.add(hud);

  // ---- menu / card panel ----------------------------------------------------------------
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 1152; panelCanvas.height = 720;
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.6), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, depthTest: false, toneMapped: false, fog: false }));
  panel.position.set(EYE.x, 1.08, -0.85);
  panel.renderOrder = 10;
  group.add(panel);

  return {
    group, yoke, screen, hud, panel,
    screenCanvas, screenTex, hudCanvas, hudTex, panelCanvas, panelTex,
    setHudVisible(v) { hud.visible = v; },
    setPanelVisible(v) { panel.visible = v; },
  };
}
