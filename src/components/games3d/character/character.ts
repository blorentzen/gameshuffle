/**
 * A GameShuffle game character (client, three.js): one skinned, vertex-colored
 * mesh for the body and the plain parts of the head (one draw call), one
 * textured mesh for the face (one more), and a jetpack that's only built and
 * drawn when flying.
 *
 *   const art = await characterArt(spec);        // pictures, once
 *   const c = new Character(art);                 // c.root goes in the scene
 *   c.setPose("seated", { floor: -3 });           // or "stand", "fly"
 *   c.setGrip({ kind: "wheel", center: [3.4, 3.3, 0], radius: 2, tilt: 0.45 });
 *   c.update(dt, { steer, lean, thrust, speed }); // every frame
 *
 * The origin is the middle of the hips; it faces +x, y up, +z to its right
 * (sizes in CHARACTER_SIZE). Materials and the shared head geometry are made
 * once and shared by every character; each character owns its skeleton, its
 * texture and (unless it matches another's) its body geometry.
 */

import * as THREE from "three";
import type { CharacterArt } from "./art";
import { BONE, buildCharacter, DIM, flameGeometry, HEAD, makeBones, packGeometry, restWorld, stickerGeometry } from "./rig";
import type { CharacterGrip, CharacterInput, CharacterLook, CharacterPose } from "./types";

const DOWN = new THREE.Vector3(0, -1, 0);

// Shared by every character (never disposed: they're tiny and reused race to race).
let skinMat: THREE.MeshLambertMaterial | null = null;
let ghostSkinMat: THREE.MeshLambertMaterial | null = null;
let packMat: THREE.MeshLambertMaterial | null = null;
let depthMat: THREE.MeshBasicMaterial | null = null;
let flameMat: THREE.MeshBasicMaterial | null = null;
let flameGeo: THREE.BufferGeometry | null = null;
function shared() {
  skinMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  ghostSkinMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false });
  packMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  depthMat ??= new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
  flameMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  flameGeo ??= flameGeometry();
  return { skinMat, ghostSkinMat, packMat, depthMat, flameMat, flameGeo };
}

/** Body geometry shared between characters that look the same (a ghost of yourself, say). */
const bodies = new Map<string, { geo: THREE.BufferGeometry; decal: THREE.BufferGeometry | null; cutAlpha: boolean; users: number; triangles: number }>();
function bodyKey(art: CharacterArt): string {
  const t = art.traits;
  return [art.look, art.spec.tone.join(","), t.skin, t.hair ?? "-", t.hairStyle ?? "-"].join("|");
}

/** One texture per picture canvas, shared by every character drawn from it. */
const textures = new WeakMap<HTMLCanvasElement, { tex: THREE.CanvasTexture; users: number }>();
function textureFor(art: CharacterArt): THREE.CanvasTexture {
  const hit = textures.get(art.canvas);
  if (hit) {
    hit.users++;
    return hit.tex;
  }
  const tex = new THREE.CanvasTexture(art.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(art.canvas, { tex, users: 1 });
  return tex;
}
function releaseTexture(art: CharacterArt) {
  const hit = textures.get(art.canvas);
  if (!hit) return;
  if (--hit.users <= 0) {
    hit.tex.dispose();
    textures.delete(art.canvas);
  }
}

interface Spring {
  x: number;
  v: number;
}
function spring(s: Spring, k: number, c: number, dt: number) {
  s.v += (-k * s.x - c * s.v) * dt;
  s.x += s.v * dt;
}

export interface CharacterOptions {
  /** Drawn see-through (a ghost racer): only its nearest surface shows. */
  ghost?: boolean;
  /** Cast shadow-map shadows (default on; a ghost never does). */
  shadows?: boolean;
}

export class Character {
  /** Put this in the scene (or in a kart). Its origin is the middle of the hips. */
  readonly root = new THREE.Group();
  readonly look: CharacterLook;
  /** Triangles in the body mesh (the face mesh adds a few hundred). */
  readonly triangles: number;
  private art: CharacterArt;
  private ghost: boolean;
  private bones: THREE.Bone[];
  private body: THREE.SkinnedMesh;
  private face: THREE.Mesh | null = null;
  private faceMat: THREE.MeshLambertMaterial;
  private faceDepthMat: THREE.MeshBasicMaterial | null = null;
  /** The cutout turns on this (toward the camera). */
  private pivot: THREE.Object3D | null = null;
  private stickerGeo: THREE.BufferGeometry | null = null;
  private pack: THREE.Mesh | null = null;
  private packGeo: THREE.BufferGeometry | null = null;
  private flame: THREE.Mesh | null = null;
  private key: string;
  private rest: THREE.Vector3[];
  private pose: CharacterPose = "seated";
  private floor = -4;
  private hunch = 0;
  private packOn = false;
  private grip: CharacterGrip | null = null;
  private viewer: THREE.Camera | null = null;
  private casting = true;
  private t = 0;
  private stride = 0;
  private prevSteer = 0;
  private prevSpeed = 0;
  private yaw = 0;
  private yawReady = false;
  private wob = { roll: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, bob: { x: 0, v: 0 } };
  private tmp = { m: new THREE.Matrix4(), inv: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3() };

  constructor(art: CharacterArt, opts: CharacterOptions = {}) {
    const m = shared();
    this.art = art;
    this.look = art.look;
    this.ghost = !!opts.ghost;
    this.key = bodyKey(art);
    this.rest = restWorld(art.look);
    let entry = bodies.get(this.key);
    if (!entry) {
      const built = buildCharacter(art);
      entry = { geo: built.body, decal: built.head.decal, cutAlpha: built.head.cutAlpha, users: 0, triangles: built.triangles };
      bodies.set(this.key, entry);
    }
    entry.users++;
    this.triangles = entry.triangles;

    this.bones = makeBones(art.look);
    this.body = new THREE.SkinnedMesh(entry.geo, this.ghost ? m.ghostSkinMat : m.skinMat);
    this.body.add(this.bones[BONE.root]);
    this.bones[BONE.root].updateMatrixWorld(true);
    this.body.bind(new THREE.Skeleton(this.bones));
    // Poses reach past the bind pose's bounds; a generous sphere keeps it from being culled early.
    this.body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 16);
    this.root.add(this.body);

    const tex = textureFor(art);
    const W = restWorld(art.look);
    const head = this.bones[BONE.head];
    this.faceMat = new THREE.MeshLambertMaterial({
      map: tex,
      // A little of the picture's own light, so faces stay readable in shade.
      emissive: 0xffffff,
      emissiveMap: tex,
      // (Not on the built head: its face must match the rest of the head exactly.)
      emissiveIntensity: art.look === "built" ? 0 : 0.22,
      alphaTest: entry.cutAlpha ? 0.5 : 0,
      transparent: this.ghost,
      opacity: this.ghost ? 0.5 : 1,
      depthWrite: !this.ghost,
    });
    if (art.look === "cutout") {
      this.stickerGeo = stickerGeometry(art);
      this.pivot = new THREE.Object3D();
      this.pivot.rotation.order = "YZX";
      this.pivot.position.set(0.1, 0.35, 0);
      head.add(this.pivot);
      this.face = new THREE.Mesh(this.stickerGeo, this.faceMat);
      this.pivot.add(this.face);
    } else if (entry.decal) {
      this.face = new THREE.Mesh(entry.decal, this.faceMat);
      // The textured part was built in character space; move it onto the head bone.
      this.face.position.set(0, -W[BONE.head].y, 0);
      head.add(this.face);
    }

    if (this.ghost) {
      const d = new THREE.SkinnedMesh(entry.geo, m.depthMat);
      d.bind(this.body.skeleton, this.body.bindMatrix);
      d.boundingSphere = this.body.boundingSphere;
      d.renderOrder = 10;
      this.body.add(d);
      this.body.renderOrder = 11;
      if (this.face) {
        this.faceDepthMat = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, map: entry.cutAlpha ? tex : null, alphaTest: entry.cutAlpha ? 0.5 : 0 });
        const fd = new THREE.Mesh(this.face.geometry, this.faceDepthMat);
        fd.renderOrder = 10;
        this.face.add(fd);
        this.face.renderOrder = 12;
      }
    }
    this.setShadows(opts.shadows ?? true);
    this.setPose("seated");
    this.update(0, {});
  }

  /** seated, stand or fly. `floor` (seated): how far below the hips the feet rest (negative). `hunch`: a forward lean (radians). `pack`: wear the jetpack on foot too. */
  setPose(pose: CharacterPose, opts: { floor?: number; hunch?: number; pack?: boolean } = {}): void {
    this.pose = pose;
    if (opts.floor !== undefined) this.floor = opts.floor;
    if (opts.hunch !== undefined) this.hunch = opts.hunch;
    this.setPack(pose === "fly" || !!opts.pack);
  }

  /** Where the hands go (null: they hang, or hold a jetpack's handles in flight). In the character's own space. */
  setGrip(grip: CharacterGrip | null): void {
    this.grip = grip;
  }

  /** The camera the cutout turns toward (other looks ignore it). */
  setViewer(camera: THREE.Camera | null): void {
    this.viewer = camera;
  }

  /** A bump (a landing): the head bobs. `amount` is about a speed (0 to 260). */
  jolt(amount: number): void {
    const k = Math.min(amount, 260) / 260;
    this.wob.bob.v -= k * (this.look === "token" ? 9 : 3.5);
    this.wob.pitch.v += k * (this.look === "token" ? 4 : 1.2);
  }

  setShadows(on: boolean): void {
    this.casting = on && !this.ghost;
    this.body.castShadow = this.casting;
    if (this.face) this.face.castShadow = this.casting;
    if (this.pack) this.pack.castShadow = this.casting;
  }

  private setPack(on: boolean): void {
    this.packOn = on;
    if (on && !this.pack) {
      const m = shared();
      this.packGeo = packGeometry(this.art.spec.tone);
      this.pack = new THREE.Mesh(this.packGeo, this.ghost ? m.ghostSkinMat : m.packMat);
      this.pack.castShadow = this.casting;
      this.bones[BONE.spine].add(this.pack);
      this.flame = new THREE.Mesh(m.flameGeo, m.flameMat);
      this.flame.renderOrder = 21;
      this.pack.add(this.flame);
    }
    if (this.pack) this.pack.visible = on;
  }

  /** Poses the character for this frame. */
  update(dt: number, input: CharacterInput = {}): void {
    const motion = input.motion ?? true;
    const steer = Math.max(-1, Math.min(1, input.steer ?? 0));
    const lean = Math.max(-1, Math.min(1, input.lean ?? 0));
    const thrust = Math.max(0, Math.min(1, input.thrust ?? 0));
    const speed = input.speed ?? 0;
    const token = this.look === "token";
    this.t += dt;
    const b = this.bones;
    const W = this.rest;

    // Head wobble: a steering change rolls it, a change of speed pitches it, a jolt bobs it.
    if (dt > 0 && motion) {
      const dSteer = steer - this.prevSteer;
      const dSpeed = speed - this.prevSpeed;
      this.wob.roll.v -= dSteer * (token ? 7 : 2.2);
      this.wob.pitch.v += Math.max(-1, Math.min(1, dSpeed * 0.02)) * (token ? 3 : 0.8);
      const k = token ? 75 : 240;
      const c = token ? 6 : 18;
      const sub = Math.max(1, Math.ceil(dt / 0.01));
      for (let i = 0; i < sub; i++) {
        spring(this.wob.roll, k, c, dt / sub);
        spring(this.wob.pitch, k, c, dt / sub);
        spring(this.wob.bob, k * 1.2, c, dt / sub);
      }
    } else if (!motion) {
      this.wob.roll = { x: 0, v: 0 };
      this.wob.pitch = { x: 0, v: 0 };
      this.wob.bob = { x: 0, v: 0 };
    }
    this.prevSteer = steer;
    this.prevSpeed = speed;
    const idle = motion ? Math.sin(this.t * 1.7) : 0;

    // Reset to the rest pose.
    const rest = [b[BONE.root], b[BONE.spine], b[BONE.neck], b[BONE.head], b[BONE.armL], b[BONE.foreL], b[BONE.armR], b[BONE.foreR], b[BONE.thighL], b[BONE.shinL], b[BONE.thighR], b[BONE.shinR]];
    for (const bone of rest) bone.rotation.set(0, 0, 0);
    b[BONE.root].position.set(0, 0, 0);
    b[BONE.spine].position.set(0, DIM.spineY, 0);
    b[BONE.head].position.set(0, W[BONE.head].y - W[BONE.neck].y, 0);

    let armsFree = !this.grip;
    if (this.pose === "seated") {
      // Thighs forward, shins down to the floor (or along it when there isn't room).
      const a = 1.35;
      const kneeY = DIM.hipY - DIM.thigh * Math.cos(a);
      const room = (kneeY - this.floor) / DIM.shin;
      const beta = room >= 1 ? 0.05 : Math.acos(Math.max(-0.2, room));
      for (const [th, sh] of [[BONE.thighL, BONE.shinL], [BONE.thighR, BONE.shinR]] as const) {
        b[th].rotation.z = a;
        b[sh].rotation.z = beta - a;
      }
      b[BONE.spine].rotation.z = -0.06 - this.hunch - lean * 0.15;
      b[BONE.spine].rotation.x = motion ? steer * 0.14 : 0;
      b[BONE.root].position.y = motion ? this.wob.bob.x * 0.15 : 0;
    } else if (this.pose === "stand") {
      const running = motion && Math.abs(speed) > 4;
      if (running) {
        this.stride += dt * Math.min(16, 3 + Math.abs(speed) * 0.09);
        const s = Math.sin(this.stride);
        const c = Math.cos(this.stride);
        b[BONE.thighL].rotation.z = s * 0.75;
        b[BONE.thighR].rotation.z = -s * 0.75;
        b[BONE.shinL].rotation.z = -0.25 - 0.75 * Math.max(0, -c);
        b[BONE.shinR].rotation.z = -0.25 - 0.75 * Math.max(0, c);
        b[BONE.root].position.y = Math.abs(c) * 0.35 - 0.2;
        b[BONE.spine].rotation.z = -0.18 - lean * 0.2 - this.hunch;
        if (armsFree) {
          b[BONE.armL].rotation.z = -s * 0.7;
          b[BONE.armR].rotation.z = s * 0.7;
          b[BONE.foreL].rotation.z = b[BONE.foreR].rotation.z = 0.9;
          b[BONE.armL].rotation.x = 0.12;
          b[BONE.armR].rotation.x = -0.12;
          armsFree = false;
        }
      } else {
        b[BONE.spine].rotation.z = -this.hunch - lean * 0.2 + idle * 0.012;
        b[BONE.spine].rotation.x = motion ? steer * 0.1 : 0;
      }
      if (armsFree) {
        b[BONE.armL].rotation.x = 0.16 + idle * 0.02;
        b[BONE.armR].rotation.x = -0.16 - idle * 0.02;
        b[BONE.foreL].rotation.z = b[BONE.foreR].rotation.z = 0.28;
        armsFree = false;
      }
    } else {
      // Flying: legs trail, knees bent, leaning into the thrust, hands on the pack's handles.
      const hover = motion ? Math.sin(this.t * 2.3) * 0.3 : 0;
      b[BONE.root].position.y = hover;
      b[BONE.thighL].rotation.z = -0.35 + (motion ? Math.sin(this.t * 2.3 + 0.6) * 0.06 : 0);
      b[BONE.thighR].rotation.z = -0.28 + (motion ? Math.sin(this.t * 2.3 + 1.4) * 0.06 : 0);
      b[BONE.shinL].rotation.z = -0.75;
      b[BONE.shinR].rotation.z = -0.6;
      b[BONE.thighL].rotation.x = 0.06;
      b[BONE.thighR].rotation.x = -0.06;
      b[BONE.spine].rotation.z = -0.16 - thrust * 0.2 - lean * 0.2 - this.hunch;
      b[BONE.spine].rotation.x = motion ? steer * 0.12 : 0;
      if (!this.grip) {
        b[BONE.armL].rotation.set(0.3, 0, 0.35);
        b[BONE.armR].rotation.set(-0.3, 0, 0.35);
        b[BONE.foreL].rotation.z = b[BONE.foreR].rotation.z = 1.0;
        armsFree = false;
      }
    }

    // The head: turns into the turn, wobbles; the token's spring stretches.
    const head = b[BONE.head];
    head.rotation.y = motion ? -steer * 0.28 : 0;
    head.rotation.x = this.wob.roll.x * (token ? 1 : 0.5) + idle * 0.015;
    head.rotation.z = this.wob.pitch.x * (token ? 1 : 0.5) - (this.pose === "fly" ? -0.18 : 0);
    head.position.y += this.wob.bob.x * (token ? 0.9 : 0.25);

    // Hands to the grip.
    if (this.grip) this.reach(steer);

    // The jetpack's flames.
    if (this.flame) {
      const on = this.packOn && (this.pose === "fly" || thrust > 0);
      this.flame.visible = on && (thrust > 0.02 || this.pose === "fly");
      const f = this.pose === "fly" ? 0.35 + thrust * 0.9 : thrust;
      const flick = motion ? 0.85 + 0.15 * Math.sin(this.t * 53) * Math.sin(this.t * 19) : 1;
      // The cones hang from the nozzles at y 0 (pack space), so they grow downward.
      this.flame.scale.set(1, Math.max(0.05, f * flick), 1);
    }

    // The cutout turns toward the camera, a little late and not quite square, tipped back a touch.
    if (this.pivot) this.faceCamera(dt, motion);
  }

  /** Two-bone reach for both arms to the grip's hand points. */
  private reach(steer: number): void {
    const g = this.grip!;
    const b = this.bones;
    const c = new THREE.Vector3(...g.center);
    let left: THREE.Vector3;
    let right: THREE.Vector3;
    if (g.kind === "wheel") {
      // Hands at nine and three, the wheel turned by the steering (clockwise for right).
      const phi = steer * 1.05;
      const across = new THREE.Vector3(0, 0, 1);
      const up = new THREE.Vector3(-Math.sin(g.tilt), Math.cos(g.tilt), 0);
      const pt = (ang: number) => c.clone().addScaledVector(across, Math.cos(ang) * g.radius).addScaledVector(up, Math.sin(ang) * g.radius);
      right = pt(-phi);
      left = pt(Math.PI - phi);
    } else if (g.kind === "bar") {
      const a = -steer * 0.35;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      right = c.clone().addScaledVector(dir, g.half);
      left = c.clone().addScaledVector(dir, -g.half);
    } else {
      right = c.clone().add(new THREE.Vector3(0, 0, g.half));
      left = c.clone().add(new THREE.Vector3(0, 0, -g.half));
    }
    // Into the spine's space (it leans).
    const spine = b[BONE.spine];
    const root = b[BONE.root];
    const { m, inv } = this.tmp;
    m.compose(root.position, root.quaternion, root.scale);
    m.multiply(this.tmp.inv.compose(spine.position, spine.quaternion, spine.scale));
    inv.copy(m).invert();
    this.arm(BONE.armL, BONE.foreL, left.applyMatrix4(inv), new THREE.Vector3(-0.35, -0.55, -1));
    this.arm(BONE.armR, BONE.foreR, right.applyMatrix4(inv), new THREE.Vector3(-0.35, -0.55, 1));
  }

  private arm(upperI: number, foreI: number, target: THREE.Vector3, pole: THREE.Vector3): void {
    const upper = this.bones[upperI];
    const fore = this.bones[foreI];
    const S = upper.position;
    const a = DIM.upper;
    const bl = DIM.fore;
    const toT = target.clone().sub(S);
    const dist = Math.max(Math.abs(a - bl) + 0.05, Math.min(a + bl - 0.02, toT.length()));
    const dir = toT.normalize();
    const cosA = (a * a + dist * dist - bl * bl) / (2 * a * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const elbow = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
    const hand = S.clone().addScaledVector(dir, dist);
    upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().sub(S).normalize());
    const local = hand.sub(elbow).normalize().applyQuaternion(this.tmp.q.copy(upper.quaternion).invert());
    fore.quaternion.setFromUnitVectors(DOWN, local);
  }

  private faceCamera(dt: number, motion: boolean): void {
    const pivot = this.pivot!;
    const parent = this.bones[BONE.head];
    let target = 0;
    let tilt = 0.08;
    if (this.viewer) {
      parent.updateWorldMatrix(true, false);
      const cam = this.viewer.getWorldPosition(this.tmp.v);
      const local = parent.worldToLocal(cam.clone());
      local.sub(pivot.position);
      target = Math.atan2(-local.z, local.x) + 0.18;
      const flat = Math.hypot(local.x, local.z);
      tilt = Math.max(0, Math.min(0.32, Math.atan2(local.y - 4, flat) * 0.6));
    }
    if (!this.yawReady || !motion || dt <= 0) {
      this.yaw = target;
      this.yawReady = true;
    } else {
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-5 * dt));
    }
    pivot.rotation.set(0, this.yaw, tilt);
  }

  dispose(): void {
    this.root.removeFromParent();
    const entry = bodies.get(this.key);
    if (entry && --entry.users <= 0) {
      entry.geo.dispose();
      entry.decal?.dispose();
      bodies.delete(this.key);
    }
    releaseTexture(this.art);
    this.faceMat.dispose();
    this.faceDepthMat?.dispose();
    this.stickerGeo?.dispose();
    this.packGeo?.dispose();
    this.body.skeleton.dispose();
  }
}

export { HEAD };
