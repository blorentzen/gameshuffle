/**
 * Particles (client, three.js): hit sparks, muzzle sparks and jetpack embers
 * (added light), and puffs of smoke (plain). Each kind is one Points draw call
 * with a fixed pool, updated on the CPU. Effects only: nothing here touches the
 * sim, so they can use Math.random.
 */

import * as THREE from "three";

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uScale / -mv.z);
  vColor = aColor;
  vAlpha = aAlpha;
}`;

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
uniform float uSoft;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(uSoft, 0.5, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private grow: Float32Array;
  private base: Float32Array;
  private drag: Float32Array;
  private count = 0;
  private material: THREE.ShaderMaterial;
  /** Fewer particles in low quality (0..1 of what's asked for). */
  density = 1;

  constructor(private cap: number, additive: boolean, private gravity: number, soft = 0.18) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.base = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  /** Pixels per world unit at one unit's distance. */
  setScale(s: number): void {
    this.material.uniforms.uScale.value = s;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, grow = 0, drag = 0): void {
    if (this.count >= this.cap) return;
    if (this.density < 1 && Math.random() > this.density) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col.set(rgb(color), i * 3);
    this.life[i] = 0;
    this.max[i] = life;
    this.base[i] = size;
    this.size[i] = size;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.alpha[i] = 1;
  }

  /** A ring of sparks. */
  burst(x: number, y: number, z: number, n: number, speed: number, colors: string[], life = 0.35, size = 0.45): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * s * 0.6, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), colors[i % colors.length], 0, 2);
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const life = this.life[i] + dt;
      if (life >= this.max[i]) continue;
      if (n !== i) {
        this.pos.copyWithin(n * 3, i * 3, i * 3 + 3);
        this.vel.copyWithin(n * 3, i * 3, i * 3 + 3);
        this.col.copyWithin(n * 3, i * 3, i * 3 + 3);
        this.max[n] = this.max[i];
        this.base[n] = this.base[i];
        this.grow[n] = this.grow[i];
        this.drag[n] = this.drag[i];
      }
      this.life[n] = life;
      const k = n * 3;
      const d = this.drag[n] ? Math.max(0, 1 - this.drag[n] * dt) : 1;
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d - this.gravity * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = life / this.max[n];
      this.size[n] = this.base[n] * (1 + this.grow[n] * t);
      this.alpha[n] = 1 - t * t;
      n++;
    }
    this.count = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, n) * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear(): void {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
