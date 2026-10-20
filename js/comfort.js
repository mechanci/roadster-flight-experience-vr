import * as THREE from 'three';

// Comfort layer. VR shows motion but the inner ear feels none, so the main job here is to
// narrow what the eyes see when the car accelerates or rotates (dynamic vignette), keep the
// cabin as a fixed reference, and fake the "weight" with small head-sink, shake and haptics.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export class Comfort {
  constructor(camera) {
    this.amount = 0;      // smoothed vignette 0..1
    this.shakeSeed = Math.random() * 100;
    this.shake = { x: 0, y: 0, z: 0, rx: 0, rz: 0 };
    this.push = { y: 0, z: 0 };

    this.material = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { uInner: { value: 100 }, uOuter: { value: 120 }, uAlpha: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uInner, uOuter, uAlpha;
        void main(){
          vec3 d = normalize(vDir);
          float ang = degrees(acos(clamp(-d.z, -1.0, 1.0)));   // angle off the view axis
          float a = smoothstep(uInner, uOuter, ang) * uAlpha;
          gl_FragColor = vec4(0.0, 0.0, 0.01, a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), this.material);
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  /**
   * @param dt     seconds
   * @param s      ride sample (f = felt vertical g, rate = rad/s)
   * @param mode   comfort mode record
   * @param active false outside the ride (menu, card)
   */
  update(dt, s, mode, active, time) {
    let target = 0;
    if (active) {
      const gTerm = clamp((s.f - 1) / 2.3);
      const rotTerm = clamp((s.rate * 180 / Math.PI) / 160);
      const floatTerm = s.f < 0.2 ? 0.12 : 0; // weightless: a little narrowing keeps it comfortable
      target = clamp(Math.max(gTerm * 0.95, rotTerm * 0.85, floatTerm)) * mode.vignette;
    }
    const k = target > this.amount ? 14 : 4;       // close fast, open slowly
    this.amount += (target - this.amount) * (1 - Math.exp(-k * dt));

    const v = this.amount;
    this.material.uniforms.uInner.value = 105 - v * 83;          // half-angle of the clear area
    this.material.uniforms.uOuter.value = 118 - v * 56;
    this.material.uniforms.uAlpha.value = v > 0.004 ? Math.min(1, 0.15 + v * 1.4) : 0;

    // head sinks into the seat under load, rises when weightless
    const targetY = active ? -0.045 * clamp((s.f - 1) / 2.3) + 0.03 * (s.f < 0.2 ? 1 : 0) : 0;
    const targetZ = active ? 0.05 * clamp((s.f - 1) / 2.3) : 0;
    this.push.y += (targetY - this.push.y) * (1 - Math.exp(-10 * dt));
    this.push.z += (targetZ - this.push.z) * (1 - Math.exp(-10 * dt));

    // shake: smooth pseudo-noise scaled by thrust and speed
    const amp = active ? (s.thrust * 1.0 + Math.min(s.speed / 14, 1) * 0.08) * mode.shake : 0;
    const t = time * 38 + this.shakeSeed;
    const n = (f, o) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.3 + o * 1.7) * 0.4;
    this.shake.x = n(1.0, 0) * 0.006 * amp;
    this.shake.y = n(1.3, 2) * 0.006 * amp;
    this.shake.z = n(0.8, 4) * 0.004 * amp;
    this.shake.rx = n(1.1, 6) * 0.004 * amp;
    this.shake.rz = n(0.9, 8) * 0.004 * amp;
  }
}
