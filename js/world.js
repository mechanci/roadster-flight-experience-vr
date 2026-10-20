import * as THREE from 'three';
import { RAMP_GEOMETRY as RAMP } from './rides.js';

// The test site: dusk sky, a long concrete strip, light poles for parallax, distant hills and
// towers. Ride-specific props (ramp, row of cars, exit sign) are switched by configureForRide().

const HORIZON = new THREE.Color(0xe08a5c);

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

function noise(ctx, w, h, base, amp, dots) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < dots; i++) {
    const v = Math.floor(128 + (Math.random() - 0.5) * amp);
    ctx.fillStyle = `rgba(${v},${v},${v},0.08)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

export function createWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);
  scene.fog = new THREE.Fog(0x7a5a66, 120, 720);
  scene.background = new THREE.Color(0x1a1830);

  // ---- sky dome -------------------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0.55, 0.06, -0.83).normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uSun;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 zen = vec3(0.04, 0.06, 0.17);
          vec3 mid = vec3(0.28, 0.22, 0.42);
          vec3 hor = vec3(0.93, 0.54, 0.36);
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, zen, smoothstep(0.18, 0.75, h));
          float s = max(dot(normalize(vDir), uSun), 0.0);
          col += vec3(1.0, 0.55, 0.25) * pow(s, 24.0) * 0.55 + vec3(1.0, 0.85, 0.6) * pow(s, 900.0);
          if (vDir.y < 0.0) col = mix(hor * 0.55, col, 0.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
  sky.renderOrder = -10;
  root.add(sky);

  // stars (only visible high up, fog does not touch them)
  {
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.35 + Math.random() * 1.2;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 900;
      pos[i * 3 + 1] = Math.sin(e) * 900;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 900;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    root.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false })));
  }

  // ---- lights ---------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x8d98d0, 0x4a3438, 1.15));
  const sun = new THREE.DirectionalLight(0xffb27a, 1.5);
  sun.position.set(55, 12, -83);
  scene.add(sun);

  // ---- ground and runway ----------------------------------------------------------------
  const sandTex = canvasTexture(512, 512, (c, w, h) => noise(c, w, h, '#6a5a4a', 90, 5000), [90, 90]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ map: sandTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  root.add(ground);

  const RUNWAY_LEN = 520, RUNWAY_W = 22;
  const concTex = canvasTexture(512, 512, (c, w, h) => {
    noise(c, w, h, '#5b5b60', 60, 6000);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  }, [RUNWAY_W / 11, RUNWAY_LEN / 11]);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY_W, RUNWAY_LEN), new THREE.MeshLambertMaterial({ map: concTex }));
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0, -RUNWAY_LEN / 2 + 40);
  root.add(runway);

  // centre dashes + edge lines
  {
    const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.25, 4), new THREE.MeshBasicMaterial({ color: 0xe9e2c8 }), 130);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 130; i++) {
      m.makeRotationX(-Math.PI / 2).setPosition(0, 0.01, 30 - i * 8);
      dashes.setMatrixAt(i, m);
    }
    root.add(dashes);
    for (const x of [-RUNWAY_W / 2 + 0.6, RUNWAY_W / 2 - 0.6]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.3, RUNWAY_LEN), new THREE.MeshBasicMaterial({ color: 0xe9e2c8 }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, 0.01, -RUNWAY_LEN / 2 + 40);
      root.add(edge);
    }
  }

  // ---- light poles + reflector posts (lots of parallax) ---------------------------------
  {
    const N = 36;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 6), new THREE.MeshLambertMaterial({ color: 0x2b2b30 }), N * 2);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.25, 0.6), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), N * 2);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < N; i++) {
      for (const side of [-1, 1]) {
        const z = 20 - i * 16, x = side * (RUNWAY_W / 2 + 4);
        m.makeTranslation(x, 4.5, z); poles.setMatrixAt(k, m);
        m.makeTranslation(x - side * 0.6, 9.1, z); heads.setMatrixAt(k, m);
        k++;
      }
    }
    root.add(poles, heads);

    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), new THREE.MeshBasicMaterial({ color: 0xff7a3a }), 200);
    k = 0;
    for (let i = 0; i < 100; i++) {
      for (const side of [-1, 1]) {
        m.makeTranslation(side * (RUNWAY_W / 2 + 0.5), 0.35, 30 - i * 5); posts.setMatrixAt(k++, m);
      }
    }
    root.add(posts);
  }

  // ---- hills + test stands --------------------------------------------------------------
  {
    const geo = new THREE.CylinderGeometry(560, 560, 80, 96, 1, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, 10 + 22 * Math.sin(a * 5 + 1) + 14 * Math.sin(a * 11) + 8 * Math.sin(a * 23 + 2));
      } else p.setY(i, -10);
    }
    geo.computeVertexNormals();
    const hills = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a2f44, side: THREE.BackSide, fog: true }));
    root.add(hills);

    const steel = new THREE.MeshLambertMaterial({ color: 0x4a4d57 });
    const redBlink = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
    const stands = [[-70, -150, 46], [90, -230, 62], [-120, -320, 38], [60, -60, 30], [-55, 10, 26]];
    stands.forEach(([x, z, h]) => {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), steel);
      tower.position.set(x, h / 2, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), redBlink);
      lamp.position.set(x, h + 0.7, z);
      root.add(tower, lamp);
    });
  }

  // ---- ramp (ride A) --------------------------------------------------------------------
  const rampGroup = new THREE.Group();
  {
    const L = RAMP.s1 - RAMP.s0;
    const shape = new THREE.Shape();
    shape.moveTo(RAMP.s0, 0);
    for (let i = 0; i <= 40; i++) {
      const x = i / 40;
      shape.lineTo(RAMP.s0 + x * L, RAMP.height * (6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3));
    }
    shape.lineTo(RAMP.edge, RAMP.height);
    shape.lineTo(RAMP.edge, 0);
    shape.lineTo(RAMP.s0, 0);
    const width = 9;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    const steelTex = canvasTexture(256, 256, (c, w, h) => {
      noise(c, w, h, '#33363e', 40, 3000);
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2;
      for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    });
    const ramp = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: steelTex, color: 0xb0b4c0 }));
    // shape x (distance) -> world -z, extrusion depth -> world x
    ramp.rotation.y = Math.PI / 2;
    ramp.position.x = -width / 2;
    rampGroup.add(ramp);
    // hazard bar at the edge and edge lights
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.5), new THREE.MeshBasicMaterial({ color: 0xffc23a }));
    bar.position.set(0, RAMP.height + 0.18, -RAMP.edge + 0.25);
    rampGroup.add(bar);
    for (let i = -4; i <= 4; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3a2a : 0xffffff }));
      l.position.set(i, RAMP.height + 0.1, -RAMP.edge + 1);
      rampGroup.add(l);
    }
    // side lights up the slope
    for (let s = RAMP.s0; s <= RAMP.s1; s += 5) {
      const x = (s - RAMP.s0) / L;
      const h = RAMP.height * (6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3);
      for (const side of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0x7fd0ff }));
        l.position.set(side * (width / 2 - 0.2), h + 0.1, -s);
        rampGroup.add(l);
      }
    }
  }
  root.add(rampGroup);

  // ---- row of cars (ride B) -------------------------------------------------------------
  const carsGroup = new THREE.Group();
  root.add(carsGroup);
  const carColors = [0xe8e8ea, 0x15161a, 0xa0242b, 0x9aa0a8, 0x2d4a7a];
  function parkedCar(color) {
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x0a0b0d });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.8), paint);
    body.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.5, 2.5), dark);
    cabin.position.set(0, 1.12, 0.1);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.9), paint);
    roof.position.set(0, 1.4, 0.1);
    g.add(body, cabin, roof);
    for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12), dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z);
      g.add(w);
    }
    return g;
  }

  // ---- end-of-ride sign -----------------------------------------------------------------
  const sign = new THREE.Group();
  {
    const tex = canvasTexture(1024, 256, (c, w, h) => {
      c.fillStyle = '#0d5c3a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#fff'; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#fff'; c.font = 'bold 84px sans-serif'; c.textAlign = 'center';
      c.fillText('PUBLIC ROAD  →', w / 2, 120);
      c.font = '38px sans-serif';
      c.fillText('thrusters: no public-road approval announced', w / 2, 190);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(0, 5.6, 0);
    for (const x of [-3.6, 3.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 0.2), new THREE.MeshLambertMaterial({ color: 0x2b2b30 }));
      leg.position.set(x, 3, -0.1);
      sign.add(leg);
    }
    sign.add(board);
  }
  root.add(sign);

  // ---- landing / parking markings + a few lit buildings ---------------------------------
  const markings = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.7, 48), new THREE.MeshBasicMaterial({ color: 0xffd34a, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012;
    const h = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.7, 32), new THREE.MeshBasicMaterial({ color: 0xffd34a, side: THREE.DoubleSide }));
    h.rotation.x = -Math.PI / 2; h.position.y = 0.012;
    markings.add(ring, h);
  }
  root.add(markings);

  const town = new THREE.Group();
  {
    const winTex = canvasTexture(128, 256, (c, w, h) => {
      c.fillStyle = '#16171d'; c.fillRect(0, 0, w, h);
      for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) {
        c.fillStyle = Math.random() < 0.45 ? '#ffd88a' : '#23252e';
        c.fillRect(x, y, 8, 9);
      }
    });
    for (let i = 0; i < 14; i++) {
      const w = 12 + Math.random() * 14, h = 14 + Math.random() * 40;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 12), new THREE.MeshBasicMaterial({ map: winTex }));
      b.material.map = winTex;
      b.position.set((i - 7) * 26 + Math.random() * 6, h / 2, (Math.random() - 0.5) * 20);
      town.add(b);
    }
  }
  root.add(town);

  rampGroup.visible = false;
  carsGroup.visible = false;

  // ---------------------------------------------------------------------------------------
  function configureForRide(ride) {
    rampGroup.visible = ride.kind === 'drop';
    carsGroup.visible = ride.kind === 'hop';
    carsGroup.clear();
    if (ride.kind === 'hop') {
      const span = ride.airSpan(2.4);
      if (span) {
        const pitch = 6.3;
        const n = Math.max(2, Math.floor((span[1] - span[0] + 1.5) / pitch));
        const mid = (span[0] + span[1]) / 2;
        for (let i = 0; i < n; i++) {
          const c = parkedCar(carColors[i % carColors.length]);
          c.position.set(0, 0, -(mid + (i - (n - 1) / 2) * pitch));
          carsGroup.add(c);
        }
      }
    }
    const end = ride.stats.distance;
    const touch = ride.sample(ride.events.touch).s;
    markings.position.set(0, 0, -touch);
    sign.position.set(0, 0, -(end + 22));
    town.position.set(0, 0, -(end + 120));
  }

  return { configureForRide, sun, root };
}
