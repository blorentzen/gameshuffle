/**
 * Everything that moves besides you (client, three.js): the three enemies (our
 * own designs), both kinds of shots, the pickups and the crane loads. Positions
 * come from the sim each frame (blended between steps); the animation (legs,
 * rotors, the turret's aim and its charge glow, spinning pickups) is drawn here.
 *
 *   Walker  a boxy coral patrol bot with one big eye, an antenna and stubby legs
 *   Flyer   a violet orb with a cyan eye and two little rotors
 *   Turret  a squat steel dome on a striped base; its barrel follows you and
 *           glows before each slow shot
 */

import * as THREE from "three";
import type { Level } from "@/lib/airtime/level";
import { loadAt, type Enemy, type Run } from "@/lib/airtime/sim";
import { at, atR, Mesher, paint } from "./mesher";

const SHOT_CAP = 96;
const FOE_CAP = 48;
const STAR_CAP = 160;

const WEAPON_COLOR = { blaster: "#7fe8ff", spread: "#c49bff", rapid: "#ffe066" } as const;

interface EnemyModel {
  root: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  parts: { legs?: THREE.Object3D[]; rotors?: THREE.Object3D[]; barrel?: THREE.Object3D; charge?: THREE.Mesh; eye?: THREE.Object3D };
  /** Seconds left of the defeat animation (0 = not dying). */
  dying: number;
  shown: boolean;
}

interface PickupModel {
  root: THREE.Group;
  kind: "spread" | "rapid" | "heart";
}

function starShape(r: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? inner : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

function heartShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.bezierCurveTo(r * 0.2, -r * 0.6, r, -r * 0.2, r, r * 0.25);
  s.bezierCurveTo(r, r * 0.8, r * 0.35, r * 0.95, 0, r * 0.5);
  s.bezierCurveTo(-r * 0.35, r * 0.95, -r, r * 0.8, -r, r * 0.25);
  s.bezierCurveTo(-r, -r * 0.2, -r * 0.2, -r * 0.6, 0, -r);
  return s;
}

/** A small picture for a weapon pickup's face: a fan for Spread, a double chevron for Rapid. */
function iconTexture(kind: "spread" | "rapid"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#ffffff";
  g.fillStyle = "#ffffff";
  g.lineWidth = 12;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (kind === "spread") {
    for (const a of [-0.42, 0, 0.42]) {
      g.beginPath();
      g.moveTo(34, 64);
      g.lineTo(34 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
      g.stroke();
    }
    g.beginPath();
    g.arc(30, 64, 11, 0, Math.PI * 2);
    g.fill();
  } else {
    for (const x of [30, 62]) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 30, 64);
      g.lineTo(x, 96);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Actors {
  readonly group = new THREE.Group();
  private disposers: { dispose(): void }[] = [];
  private levelDisposers: { dispose(): void }[] = [];
  private enemyModels = new Map<number, EnemyModel>();
  private pickupModels = new Map<number, PickupModel>();
  private loadModels: { root: THREE.Group; cable: THREE.Mesh; block: THREE.Group }[] = [];
  private shotMesh: THREE.InstancedMesh;
  private foeMesh: THREE.InstancedMesh;
  private foeHalo: THREE.InstancedMesh;
  private starMesh: THREE.InstancedMesh;
  private starIds: number[] = [];
  private geo: Record<string, THREE.BufferGeometry> = {};
  private glowTex: THREE.CanvasTexture;
  private icons: Record<"spread" | "rapid", THREE.CanvasTexture>;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.glowTex = glowTexture();
    this.icons = { spread: iconTexture("spread"), rapid: iconTexture("rapid") };
    this.disposers.push(this.glowTex, this.icons.spread, this.icons.rapid);
    this.buildGeometry();

    // Your shots: bright streaks along their path, solid colors so they read on a light sky.
    const shotGeo = new THREE.CapsuleGeometry(0.12, 0.7, 2, 6);
    shotGeo.rotateZ(Math.PI / 2);
    const shotMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    this.shotMesh = new THREE.InstancedMesh(shotGeo, shotMat, SHOT_CAP);
    this.shotMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHOT_CAP * 3), 3);
    this.shotMesh.frustumCulled = false;
    this.shotMesh.renderOrder = 18;
    // Turret shots: a hot orange orb with a white core, in a soft red halo.
    const orb = new Mesher();
    orb.blob(0.32, "#ff5a1f", at(0, 0, 0), 1);
    orb.blob(0.17, "#fff1c4", at(0, 0, 0.2), 1);
    const orbGeo = orb.build();
    const orbMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.foeMesh = new THREE.InstancedMesh(orbGeo, orbMat, FOE_CAP);
    this.foeMesh.frustumCulled = false;
    const haloGeo = new THREE.PlaneGeometry(1.8, 1.8);
    const haloMat = new THREE.MeshBasicMaterial({ map: this.glowTex, color: "#ff3b1f", transparent: true, opacity: 0.55, depthWrite: false });
    this.foeHalo = new THREE.InstancedMesh(haloGeo, haloMat, FOE_CAP);
    this.foeHalo.frustumCulled = false;
    this.foeHalo.renderOrder = 17;
    // Stars: little gold stars that spin.
    const starGeo = new THREE.ExtrudeGeometry(starShape(0.34, 0.15), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 });
    starGeo.translate(0, 0, -0.06);
    const starMat = new THREE.MeshLambertMaterial({ color: "#ffd23e", emissive: new THREE.Color("#8a5a00") });
    this.starMesh = new THREE.InstancedMesh(starGeo, starMat, STAR_CAP);
    this.starMesh.frustumCulled = false;
    this.disposers.push(shotGeo, shotMat, orbGeo, orbMat, haloGeo, haloMat, starGeo, starMat);
    this.group.add(this.shotMesh, this.foeMesh, this.foeHalo, this.starMesh);
  }

  private buildGeometry(): void {
    // Walker: body, eye and antenna (one mesh), and a leg.
    const wb = new Mesher();
    wb.box(0.95, 0.72, 0.8, "#f0644a", at(0, 0.3, 0));
    wb.box(0.97, 0.16, 0.82, "#c9452f", at(0, 0.3, 0));
    wb.box(0.9, 0.08, 0.76, "#ffd3c8", at(0, 1.0, 0));
    wb.blob(0.25, "#ffffff", at(-0.36, 0.72, 0.18), 1);
    wb.blob(0.12, "#1b2033", at(-0.55, 0.72, 0.22), 1);
    // A cross brow over the eye.
    wb.add(new THREE.BoxGeometry(0.42, 0.08, 0.1), "#7a1f12", atR(-0.4, 0.98, 0.3, 0, 0, -0.25));
    wb.cyl(0.03, 0.03, 0.34, 5, "#3a404c", at(0.15, 1.02, 0));
    wb.blob(0.09, "#ffd23e", at(0.15, 1.4, 0), 0);
    this.geo.walker = wb.build();
    const wl = new Mesher();
    wl.box(0.18, 0.3, 0.2, "#3a404c", at(0, -0.3, 0));
    wl.box(0.28, 0.08, 0.24, "#262b36", at(-0.04, -0.34, 0));
    this.geo.walkerLeg = wl.build();
    // Flyer: the orb, a band and a cyan eye; a rotor.
    const fb = new Mesher();
    fb.blob(0.46, "#7b5cff", at(0, 0.45, 0), 1);
    fb.cyl(0.5, 0.5, 0.1, 12, "#5a3fd6", at(0, 0.4, 0));
    fb.blob(0.17, "#7cf3ff", at(-0.36, 0.48, 0.12), 1);
    fb.blob(0.08, "#0b3a4a", at(-0.5, 0.48, 0.16), 0);
    fb.box(0.06, 0.2, 0.06, "#3a404c", at(-0.25, 0.86, 0));
    fb.box(0.06, 0.2, 0.06, "#3a404c", at(0.25, 0.86, 0));
    fb.prism([[0, 0], [0.42, -0.18], [0.36, 0.1]], 0.06, "#5a3fd6", at(0.38, 0.4, 0));
    this.geo.flyer = fb.build();
    const fr = new Mesher();
    fr.cyl(0.32, 0.32, 0.03, 10, "#d9dfe8", at(0, 0, 0));
    fr.box(0.66, 0.04, 0.08, "#9aa3ae", at(0, 0.02, 0));
    this.geo.rotor = fr.build();
    // Turret: a striped base and a dome; the barrel.
    // Hazard colors so it stands out on a grey roof: a dark base with yellow and black stripes, a yellow dome.
    const tb = new Mesher();
    tb.box(1.3, 0.4, 1.1, "#2b3445", at(0, 0, 0));
    for (let i = 0; i < 6; i++) tb.box(0.2, 0.16, 1.12, i % 2 ? "#1f2937" : "#f2b134", at(-0.55 + i * 0.22, 0.13, 0));
    tb.add(new THREE.SphereGeometry(0.52, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#f2b134", at(0, 0.4, 0));
    tb.cyl(0.54, 0.54, 0.08, 12, "#1f2937", at(0, 0.4, 0));
    tb.blob(0.12, "#ff3b30", at(0.2, 0.86, 0.2), 0);
    this.geo.turret = tb.build();
    const tg = new Mesher();
    tg.add(new THREE.CylinderGeometry(0.12, 0.14, 0.85, 8), "#1f2937", atR(0.42, 0, 0, 0, 0, Math.PI / 2));
    tg.add(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 8), "#ff6a3d", atR(0.84, 0, 0, 0, 0, Math.PI / 2));
    this.geo.barrel = tg.build();
    this.geo.charge = new THREE.IcosahedronGeometry(0.22, 1);
    // A pickup capsule.
    const cap = new Mesher();
    cap.add(new THREE.BoxGeometry(0.86, 0.86, 0.5), "#ffffff");
    this.geo.pickup = cap.build();
    const heart = new THREE.ExtrudeGeometry(heartShape(0.42), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
    heart.translate(0, 0, -0.11);
    this.geo.heart = heart;
    // A crane's load: a bundle of steel beams with striped ends.
    const ld = new Mesher();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) ld.span(-0.85, -0.6 + j * 0.42, -0.5 + i * 0.34, 0.85, -0.6 + j * 0.42 + 0.36, -0.5 + i * 0.34 + 0.3, j ? "#c2410c" : "#9a3412");
    }
    ld.span(-0.92, -0.65, -0.55, -0.82, 0.25, 0.55, "#1f2937");
    ld.span(0.82, -0.65, -0.55, 0.92, 0.25, 0.55, "#1f2937");
    for (let k = 0; k < 4; k++) ld.span(-0.95, -0.55 + k * 0.22, -0.56, -0.9, -0.45 + k * 0.22, 0.56, k % 2 ? "#1f2937" : "#f2b134");
    for (let k = 0; k < 4; k++) ld.span(0.9, -0.55 + k * 0.22, -0.56, 0.95, -0.45 + k * 0.22, 0.56, k % 2 ? "#1f2937" : "#f2b134");
    ld.span(-0.88, 0.22, -0.06, 0.88, 0.3, 0.06, "#4b5563");
    ld.add(new THREE.ConeGeometry(0.5, 0.6, 4), "#4b5563", at(0, 0.6, 0, Math.PI / 4));
    this.geo.load = ld.build();
    const hook = new Mesher();
    hook.box(0.4, 0.3, 0.3, "#f2b134", at(0, -0.15, 0));
    this.geo.trolley = hook.build();
    const cable = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
    cable.translate(0, -0.5, 0);
    this.geo.cable = cable;
    for (const g of Object.values(this.geo)) this.disposers.push(g);
  }

  private enemyModel(e: Enemy): EnemyModel {
    const mat = paint({ emissive: new THREE.Color("#000000") });
    this.levelDisposers.push(mat);
    const root = new THREE.Group();
    const parts: EnemyModel["parts"] = {};
    if (e.kind === "walker") {
      root.add(new THREE.Mesh(this.geo.walker, mat));
      parts.legs = [-0.22, 0.22].map((x) => {
        const g = new THREE.Group();
        g.position.set(x, 0.34, 0.2);
        g.add(new THREE.Mesh(this.geo.walkerLeg, mat));
        root.add(g);
        return g;
      });
    } else if (e.kind === "flyer") {
      root.add(new THREE.Mesh(this.geo.flyer, mat));
      parts.rotors = [-0.25, 0.25].map((x) => {
        const r = new THREE.Mesh(this.geo.rotor, mat);
        r.position.set(x, 0.98, 0);
        root.add(r);
        return r;
      });
    } else {
      root.add(new THREE.Mesh(this.geo.turret, mat));
      const barrel = new THREE.Group();
      barrel.position.set(0, 0.72, 0);
      barrel.add(new THREE.Mesh(this.geo.barrel, mat));
      root.add(barrel);
      parts.barrel = barrel;
      const cm = new THREE.MeshBasicMaterial({ map: this.glowTex, color: "#ff7a3d", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.levelDisposers.push(cm);
      const charge = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), cm);
      this.levelDisposers.push(charge.geometry);
      charge.visible = false;
      charge.renderOrder = 16;
      root.add(charge);
      parts.charge = charge;
    }
    this.group.add(root);
    return { root, mat, parts, dying: 0, shown: true };
  }

  /** Builds the models for a level (called at the start of each level). */
  setLevel(run: Run): void {
    this.clearLevel();
    for (const e of run.enemies) this.enemyModels.set(e.id, this.enemyModel(e));
    for (const k of run.pickups) {
      if (k.kind === "star") continue;
      const root = new THREE.Group();
      if (k.kind === "heart") {
        const mat = new THREE.MeshLambertMaterial({ color: "#ff4d6d", emissive: new THREE.Color("#7a0a20") });
        this.levelDisposers.push(mat);
        root.add(new THREE.Mesh(this.geo.heart, mat));
      } else {
        const color = k.kind === "spread" ? "#8b5cf6" : "#0ea5b7";
        const mat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.35) });
        const face = new THREE.MeshBasicMaterial({ map: this.icons[k.kind], transparent: true, depthWrite: false });
        const plane = new THREE.PlaneGeometry(0.62, 0.62);
        this.levelDisposers.push(mat, face, plane);
        root.add(new THREE.Mesh(this.geo.pickup, mat));
        const f = new THREE.Mesh(plane, face);
        f.position.z = 0.26;
        root.add(f);
      }
      const halo = new THREE.MeshBasicMaterial({ map: this.glowTex, color: k.kind === "heart" ? "#ff6b8a" : k.kind === "spread" ? "#b18cff" : "#5fe3f0", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const hp = new THREE.PlaneGeometry(2.4, 2.4);
      this.levelDisposers.push(halo, hp);
      const h = new THREE.Mesh(hp, halo);
      h.position.z = -0.3;
      h.renderOrder = 14;
      root.add(h);
      root.position.set(k.x, k.y, 0);
      this.group.add(root);
      this.pickupModels.set(k.id, { root, kind: k.kind });
    }
    this.starIds = run.pickups.filter((k) => k.kind === "star").map((k) => k.id).slice(0, STAR_CAP);
    for (const l of run.level.loads) this.loadModels.push(this.loadModel(l));
  }

  private loadModel(l: Level["loads"][number]): { root: THREE.Group; cable: THREE.Mesh; block: THREE.Group } {
    const mat = paint();
    this.levelDisposers.push(mat);
    const root = new THREE.Group();
    root.position.set(l.px, l.py, 0);
    const trolley = new THREE.Mesh(this.geo.trolley, mat);
    root.add(trolley);
    const cable = new THREE.Mesh(this.geo.cable, mat);
    root.add(cable);
    const block = new THREE.Group();
    block.add(new THREE.Mesh(this.geo.load, mat));
    root.add(block);
    this.group.add(root);
    return { root, cable, block };
  }

  private clearLevel(): void {
    for (const m of this.enemyModels.values()) this.group.remove(m.root);
    for (const m of this.pickupModels.values()) this.group.remove(m.root);
    for (const m of this.loadModels) this.group.remove(m.root);
    this.enemyModels.clear();
    this.pickupModels.clear();
    this.loadModels = [];
    for (const d of this.levelDisposers) d.dispose();
    this.levelDisposers = [];
  }

  /** An enemy was defeated: it pops and spins away. */
  defeated(id: number): void {
    const m = this.enemyModels.get(id);
    if (m) m.dying = 0.22;
  }

  /**
   * Places everything for this frame. `prev` holds positions from the step
   * before (by id), `a` how far toward the current step to draw, `tick` the
   * blended step for the crane loads, `t` seconds for animation.
   */
  update(run: Run, prev: Map<number, [number, number]>, a: number, tick: number, t: number, dt: number, camX: number, view: number, motion: boolean): void {
    const lerp = (id: number, x: number, y: number): [number, number] => {
      const p = prev.get(id);
      return p ? [p[0] + (x - p[0]) * a, p[1] + (y - p[1]) * a] : [x, y];
    };
    const seen = (x: number) => Math.abs(x - camX) < view;

    for (const e of run.enemies) {
      const m = this.enemyModels.get(e.id);
      if (!m) continue;
      if (m.dying > 0) {
        m.dying = Math.max(0, m.dying - dt);
        const k = m.dying / 0.22;
        m.root.scale.setScalar(Math.max(0.01, k * 1.25));
        m.root.rotation.z += dt * 14;
        m.mat.emissive.setScalar(1 - k * 0.5);
        if (m.dying === 0) m.root.visible = false;
        continue;
      }
      const show = e.alive && !e.gone && seen(e.x);
      m.root.visible = show;
      if (!show) continue;
      const [x, y] = lerp(e.id, e.x, e.y);
      m.root.position.set(x, y, 0);
      m.mat.emissive.setScalar(e.flash > 0 ? 0.9 * (e.flash / 6) : 0);
      if (e.kind === "walker") {
        const facing = e.awake ? e.dir : -1;
        m.root.scale.set(-facing, 1, 1);
        const s = e.awake && motion ? Math.sin(t * 11 + e.id) * 0.55 : 0;
        m.parts.legs![0].rotation.z = s;
        m.parts.legs![1].rotation.z = -s;
      } else if (e.kind === "flyer") {
        for (const r of m.parts.rotors!) r.rotation.y += dt * 28;
        m.root.rotation.z = motion ? Math.sin(t * 3 + e.id) * 0.08 : 0;
      } else {
        // The barrel points at you (it starts facing left, toward where you come from).
        m.parts.barrel!.rotation.z = Math.atan2(e.aimY, e.aimX);
        const c = m.parts.charge!;
        if (e.charge > 0) {
          const k = 1 - e.charge / 36;
          c.visible = true;
          c.position.set(0.85 * e.aimX, 0.72 + 0.85 * e.aimY, 0.3);
          c.scale.setScalar(0.4 + k * 1.1 + (motion ? Math.sin(t * 40) * 0.08 : 0));
        } else c.visible = false;
      }
    }

    // Shots.
    let n = 0;
    let f = 0;
    for (const s of run.shots) {
      if (!seen(s.x)) continue;
      const [x, y] = lerp(s.id, s.x, s.y);
      if (!s.foe) {
        if (n >= SHOT_CAP) continue;
        this.q.setFromAxisAngle(this.zAxis, Math.atan2(s.vy, s.vx));
        this.m.compose(this.v.set(x, y, 0.1), this.q, this.s.set(1, 1, 1));
        this.shotMesh.setMatrixAt(n, this.m);
        this.shotMesh.setColorAt(n, this.c.set(WEAPON_COLOR[s.kind as keyof typeof WEAPON_COLOR] ?? "#ffffff"));
        n++;
      } else {
        if (f >= FOE_CAP) continue;
        const pulse = motion ? 1 + Math.sin(t * 18 + s.id) * 0.12 : 1;
        this.m.compose(this.v.set(x, y, 0.1), this.q.identity(), this.s.set(pulse, pulse, pulse));
        this.foeMesh.setMatrixAt(f, this.m);
        this.m.compose(this.v.set(x, y, 0.05), this.q.identity(), this.s.set(pulse, pulse, 1));
        this.foeHalo.setMatrixAt(f, this.m);
        f++;
      }
    }
    this.shotMesh.count = n;
    this.shotMesh.instanceMatrix.needsUpdate = true;
    if (this.shotMesh.instanceColor) this.shotMesh.instanceColor.needsUpdate = true;
    this.foeMesh.count = f;
    this.foeHalo.count = f;
    this.foeMesh.instanceMatrix.needsUpdate = true;
    this.foeHalo.instanceMatrix.needsUpdate = true;

    // Pickups: weapons and hearts bob and turn; stars spin.
    const bob = (id: number) => (motion ? Math.sin(t * 2.6 + id) * 0.12 : 0);
    for (const k of run.pickups) {
      if (k.kind === "star") continue;
      const m = this.pickupModels.get(k.id);
      if (!m) continue;
      m.root.visible = !k.taken && seen(k.x);
      if (!m.root.visible) continue;
      m.root.position.set(k.x, k.y + bob(k.id), 0);
      m.root.rotation.y = m.kind === "heart" ? (motion ? Math.sin(t * 2) * 0.6 : 0) : motion ? Math.sin(t * 1.6) * 0.35 : 0;
    }
    let st = 0;
    const byId = new Map(run.pickups.map((k) => [k.id, k]));
    for (const id of this.starIds) {
      const k = byId.get(id);
      if (!k || k.taken || !seen(k.x)) continue;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), motion ? t * 3 + k.x : 0);
      this.m.compose(this.v.set(k.x, k.y + bob(k.id) * 0.6, 0), this.q, this.s.set(1, 1, 1));
      this.starMesh.setMatrixAt(st++, this.m);
    }
    this.starMesh.count = st;
    this.starMesh.instanceMatrix.needsUpdate = true;

    // Crane loads.
    run.level.loads.forEach((l, i) => {
      const lm = this.loadModels[i];
      if (!lm) return;
      const pos = loadAt(l, tick);
      lm.cable.rotation.z = pos.angle;
      lm.cable.scale.set(1, l.len - 0.3, 1);
      lm.block.position.set(pos.x - l.px, pos.y - l.py, 0);
      lm.block.rotation.z = pos.angle;
    });
  }

  dispose(): void {
    this.clearLevel();
    for (const d of this.disposers) d.dispose();
  }
}

/** A weapon's shot color (for muzzle flashes and sparks). */
export function weaponColor(kind: keyof typeof WEAPON_COLOR): string {
  return WEAPON_COLOR[kind];
}
