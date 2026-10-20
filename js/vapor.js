import * as THREE from 'three';

// Cold-gas plumes: soft white puffs that fade and grow. One draw call, fixed particle pool.

const N = 700;

export class Vapor {
  constructor(scene) {
    this.pos = new Float32Array(N * 3);
    this.age = new Float32Array(N).fill(1);
    this.size = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N).fill(1);
    this.next = 0;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uMap: { value: new THREE.CanvasTexture(c) }, uScale: { value: 600 } },
      vertexShader: `
        attribute float aAge; attribute float aSize; varying float vAge; uniform float uScale;
        void main(){
          vAge = aAge;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 400.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAge; uniform sampler2D uMap;
        void main(){
          if (vAge >= 1.0) discard;
          float a = texture2D(uMap, gl_PointCoord).a * (1.0 - vAge) * 0.62;
          gl_FragColor = vec4(0.92, 0.94, 1.0, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  emit(origin, dir, speed, carVel, size, spread = 3) {
    const i = this.next; this.next = (this.next + 1) % N;
    const r = () => (Math.random() - 0.5);
    this.pos.set([origin.x + r() * 0.15, origin.y + r() * 0.15, origin.z + r() * 0.15], i * 3);
    this.vel.set([
      carVel.x * 0.35 + dir.x * speed + r() * spread,
      carVel.y * 0.35 + dir.y * speed + r() * spread,
      carVel.z * 0.35 + dir.z * speed + r() * spread,
    ], i * 3);
    this.age[i] = 0;
    this.life[i] = 0.9 + Math.random() * 0.8;
    this.size[i] = size * (0.7 + Math.random() * 0.6);
  }

  update(dt) {
    const damp = Math.exp(-1.8 * dt);
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] += dt / this.life[i];
      this.vel[i * 3] *= damp; this.vel[i * 3 + 1] *= damp; this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += dt * 3.2;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAge.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  clear() { this.age.fill(1); this.geo.attributes.aAge.needsUpdate = true; }
}
