/**
 * The character's geometry (client, three.js): the skeleton's layout, a
 * builder that merges simple solids into one skinned, vertex-colored,
 * flat-shaded geometry (one draw call for the whole body and the untextured
 * parts of the head), and the textured head parts (one more draw call).
 *
 * Character space: the origin is the middle of the hips, x forward, y up, z to
 * the character's right. Everything is built in the bind pose: arms hanging,
 * legs straight down, every bone unrotated at its rest position.
 */

import * as THREE from "three";
import type { CharacterArt } from "./art";
import type { CharacterLook } from "./types";

export const BONE = { root: 0, spine: 1, neck: 2, head: 3, armL: 4, foreL: 5, armR: 6, foreR: 7, thighL: 8, shinL: 9, thighR: 10, shinR: 11 } as const;
export const BONE_COUNT = 12;
const PARENT = [-1, 0, 1, 2, 1, 4, 1, 6, 0, 8, 0, 10];

/** Lengths and joints (world units). */
export const DIM = {
  spineY: 0.7,
  neckY: 5.2,
  shoulderY: 4.3,
  shoulderZ: 3.1,
  upper: 2.8,
  /** Elbow to the middle of the hand. */
  fore: 2.95,
  hipY: -0.4,
  hipZ: 1.3,
  thigh: 2.6,
  /** Knee to the sole. */
  shin: 3.3,
  neckLen: 1.0,
  /** The token's spring. */
  springLen: 1.4,
} as const;

export const PANTS = "#2f3646";
export const GLOVE = "#f6f5f1";
export const METAL = "#c3c9d2";
export const DARK = "#23262d";
const WHITE = "#f6f5f1";
const SMOKE = "#2b3a4f";

/** Helmet, built head and puck sizes. */
export const HEAD = {
  helmetR: 3.75,
  helmetC: 3.1,
  builtR: 3.35,
  builtC: 3.0,
  puckR: 3.5,
  puckFace: 3.02,
  puckT: 1.3,
  puckC: 3.3,
  /** The face patch's planar UV span (world units across a square). */
  span: 6.6,
} as const;

export function neckLenFor(look: CharacterLook): number {
  return look === "token" ? DIM.springLen : DIM.neckLen;
}

/** Each bone's rest position relative to its parent. */
export function restPositions(look: CharacterLook): THREE.Vector3[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return [
    v(0, 0, 0),
    v(0, DIM.spineY, 0),
    v(0, DIM.neckY, 0),
    v(0, neckLenFor(look), 0),
    v(0, DIM.shoulderY, -DIM.shoulderZ),
    v(0, -DIM.upper, 0),
    v(0, DIM.shoulderY, DIM.shoulderZ),
    v(0, -DIM.upper, 0),
    v(0, DIM.hipY, -DIM.hipZ),
    v(0, -DIM.thigh, 0),
    v(0, DIM.hipY, DIM.hipZ),
    v(0, -DIM.thigh, 0),
  ];
}

/** Each bone's rest position in character space (the bind pose has no rotations, so it's a sum). */
export function restWorld(look: CharacterLook): THREE.Vector3[] {
  const local = restPositions(look);
  const out: THREE.Vector3[] = [];
  local.forEach((p, i) => out.push(PARENT[i] < 0 ? p.clone() : out[PARENT[i]].clone().add(p)));
  return out;
}

export function makeBones(look: CharacterLook): THREE.Bone[] {
  const local = restPositions(look);
  const bones = local.map((p) => {
    const b = new THREE.Bone();
    b.position.copy(p);
    return b;
  });
  bones.forEach((b, i) => {
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
  });
  return bones;
}

type Tint = string | THREE.Color;
type ColorFn = (c: THREE.Vector3, n: THREE.Vector3) => Tint;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _cen = new THREE.Vector3();
const _col = new THREE.Color();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _lcen = new THREE.Vector3();
const _ln = new THREE.Vector3();

interface AddOpts {
  bone: number;
  at?: THREE.Matrix4;
  color: Tint | ColorFn;
  /** Keep a triangle? Given its centroid and face normal in the part's own space (before `at`). */
  keep?: (c: THREE.Vector3, n: THREE.Vector3) => boolean;
  /** A second bone, weighted by `blend` of each vertex's own position (0 = all `bone`, 1 = all `bone2`). */
  bone2?: number;
  blend?: (p: THREE.Vector3) => number;
}

/** Collects flat-shaded, vertex-colored, skinned triangles. */
export class Rig {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];

  add(geo: THREE.BufferGeometry, o: AddOpts): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute("position");
    const fixed = typeof o.color === "function" ? null : _col.set(o.color as THREE.ColorRepresentation).clone();
    for (let i = 0; i + 2 < p.count; i += 3) {
      _la.fromBufferAttribute(p, i);
      _lb.fromBufferAttribute(p, i + 1);
      _lc.fromBufferAttribute(p, i + 2);
      _lcen.copy(_la).add(_lb).add(_lc).multiplyScalar(1 / 3);
      _ln.subVectors(_lc, _lb).cross(_a.subVectors(_la, _lb)).normalize();
      if (o.keep && !o.keep(_lcen, _ln)) continue;
      const color = fixed ?? _col.set((o.color as ColorFn)(_lcen, _ln) as THREE.ColorRepresentation);
      const local = [_la.clone(), _lb.clone(), _lc.clone()];
      const placed = local.map((v) => (o.at ? v.clone().applyMatrix4(o.at) : v.clone()));
      _n.subVectors(placed[2], placed[1]).cross(_b.subVectors(placed[0], placed[1])).normalize();
      for (let k = 0; k < 3; k++) {
        const w = o.bone2 !== undefined && o.blend ? Math.max(0, Math.min(1, o.blend(local[k]))) : 0;
        this.pos.push(placed[k].x, placed[k].y, placed[k].z);
        this.nor.push(_n.x, _n.y, _n.z);
        this.col.push(color.r, color.g, color.b);
        this.si.push(o.bone, o.bone2 ?? 0, 0, 0);
        this.sw.push(1 - w, w, 0, 0);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** Collects flat-shaded, textured triangles (UVs from a function of the part's own position). */
export class Decal {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];

  add(geo: THREE.BufferGeometry, uvOf: (p: THREE.Vector3) => [number, number], at?: THREE.Matrix4, keep?: (c: THREE.Vector3) => boolean): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute("position");
    for (let i = 0; i + 2 < p.count; i += 3) {
      const local = [new THREE.Vector3().fromBufferAttribute(p, i), new THREE.Vector3().fromBufferAttribute(p, i + 1), new THREE.Vector3().fromBufferAttribute(p, i + 2)];
      _cen.copy(local[0]).add(local[1]).add(local[2]).multiplyScalar(1 / 3);
      if (keep && !keep(_cen)) continue;
      const placed = local.map((v) => (at ? v.clone().applyMatrix4(at) : v.clone()));
      _n.subVectors(placed[2], placed[1]).cross(_b.subVectors(placed[0], placed[1])).normalize();
      for (let k = 0; k < 3; k++) {
        const [u, v] = uvOf(local[k]);
        this.pos.push(placed[k].x, placed[k].y, placed[k].z);
        this.nor.push(_n.x, _n.y, _n.z);
        this.uv.push(u, v);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  /** Raw triangles that already carry UVs (the sticker). */
  addUv(geo: THREE.BufferGeometry, at?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute("position");
    const t = g.getAttribute("uv");
    for (let i = 0; i + 2 < p.count; i += 3) {
      const placed = [0, 1, 2].map((k) => {
        const v = new THREE.Vector3().fromBufferAttribute(p, i + k);
        return at ? v.applyMatrix4(at) : v;
      });
      _n.subVectors(placed[2], placed[1]).cross(_b.subVectors(placed[0], placed[1])).normalize();
      for (let k = 0; k < 3; k++) {
        this.pos.push(placed[k].x, placed[k].y, placed[k].z);
        this.nor.push(_n.x, _n.y, _n.z);
        this.uv.push(t.getX(i + k), t.getY(i + k));
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** A translation, with an optional Euler turn and a scale. */
export function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** An eight-sided frustum from y0 to y1, its half-depth (x) and half-width (z) at each end. */
function frustum(y0: number, y1: number, x0: number, z0: number, x1: number, z1: number, sides = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, y1 - y0, sides, 1);
  g.rotateY(Math.PI / sides);
  const p = g.getAttribute("position");
  const h = y1 - y0;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setXYZ(i, p.getX(i) * (x0 + (x1 - x0) * t), y0 + t * h, p.getZ(i) * (z0 + (z1 - z0) * t));
  }
  return g;
}

/** A cylinder hanging down from a joint (a limb): radius at the joint, at the far end, length. */
function limb(r0: number, r1: number, len: number, sides = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, len, sides, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

function mixHex(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** The body: hips, a jersey in the two colors, arms with gloves, legs and shoes, and a neck. */
export function addBody(rig: Rig, look: CharacterLook, tone: [string, string], neck: string): void {
  const [deep, bright] = tone;
  const W = restWorld(look);
  const s = W[BONE.spine].y;
  // Hips and shorts.
  rig.add(frustum(-0.95, 1.0, 1.55, 2.05, 1.5, 2.1), { bone: BONE.root, color: PANTS });
  // The jersey: torso, a band across the chest and back, shoulders sloping to the collar.
  rig.add(frustum(s - 0.3, s + 5.2, 1.5, 2.05, 1.85, 2.75), { bone: BONE.spine, color: deep });
  rig.add(frustum(s + 2.5, s + 3.3, 1.72, 2.48, 1.79, 2.6), { bone: BONE.spine, color: bright });
  rig.add(frustum(s + 5.1, s + 5.75, 1.78, 2.62, 1.05, 1.2), { bone: BONE.spine, color: deep });
  rig.add(new THREE.CylinderGeometry(0.98, 1.02, 0.42, 8), { bone: BONE.spine, color: WHITE, at: at(0, s + 5.75, 0) });
  // Neck (into the head; the token's spring replaces it).
  if (look !== "token") {
    const len = DIM.neckLen + 1.1;
    rig.add(new THREE.CylinderGeometry(0.7, 0.78, len, 8), { bone: BONE.neck, color: neck, at: at(0, W[BONE.neck].y - 0.3 + len / 2, 0) });
  }
  // Arms: a shoulder ball, the sleeve, a cuff and a glove.
  for (const [arm, fore] of [[BONE.armL, BONE.foreL], [BONE.armR, BONE.foreR]] as const) {
    const a = W[arm];
    const f = W[fore];
    rig.add(new THREE.IcosahedronGeometry(1.12, 0), { bone: arm, color: bright, at: at(a.x, a.y, a.z) });
    rig.add(limb(0.8, 0.72, DIM.upper), { bone: arm, color: deep, at: at(a.x, a.y, a.z) });
    rig.add(limb(0.7, 0.62, 2.35), { bone: fore, color: deep, at: at(f.x, f.y + 0.05, f.z) });
    rig.add(new THREE.CylinderGeometry(0.74, 0.74, 0.42, 7), { bone: fore, color: bright, at: at(f.x, f.y - 2.3, f.z) });
    rig.add(new THREE.IcosahedronGeometry(0.84, 0), { bone: fore, color: GLOVE, at: at(f.x + 0.05, f.y - DIM.fore, f.z, 0, 0, 0, 0.95, 1, 0.82) });
  }
  // Legs: pants, a shoe in the bright color on a white sole.
  for (const [thigh, shin] of [[BONE.thighL, BONE.shinL], [BONE.thighR, BONE.shinR]] as const) {
    const t = W[thigh];
    const k = W[shin];
    rig.add(limb(1.05, 0.92, DIM.thigh + 0.25), { bone: thigh, color: PANTS, at: at(t.x, t.y + 0.1, t.z) });
    rig.add(limb(0.9, 0.8, DIM.shin - 0.7), { bone: shin, color: PANTS, at: at(k.x, k.y + 0.05, k.z) });
    rig.add(new THREE.BoxGeometry(2.45, 0.9, 1.55), { bone: shin, color: bright, at: at(k.x + 0.5, k.y - DIM.shin + 0.75, k.z) });
    rig.add(new THREE.BoxGeometry(2.6, 0.32, 1.65), { bone: shin, color: WHITE, at: at(k.x + 0.5, k.y - DIM.shin + 0.16, k.z) });
  }
}

/** UVs into the front (left) or back (right) square of the character's picture. */
function frontUv(span: number, cy = 0) {
  return (p: THREE.Vector3): [number, number] => [(0.5 - p.z / span) * 0.5, 0.5 + (p.y - cy) / span];
}
function backUv(span: number, cy = 0) {
  return (p: THREE.Vector3): [number, number] => [0.5 + (0.5 + p.z / span) * 0.5, 0.5 + (p.y - cy) / span];
}

const DEG = Math.PI / 180;

/** The helmet: shell (a stripe over the crown, a deep chin band), a visor flipped up, the face in the opening, a roundel on the back. */
function addHelmet(rig: Rig, decal: Decal, tone: [string, string], headY: number) {
  const [deep, bright] = tone;
  const R = HEAD.helmetR;
  const cy = headY + HEAD.helmetC;
  const opening = (c: THREE.Vector3) => {
    const d = c.clone().normalize();
    const lat = Math.asin(d.y) / DEG;
    const az = Math.atan2(d.z, d.x) / DEG;
    return Math.abs(az) < 57 && lat > -31 && lat < 31;
  };
  rig.add(new THREE.SphereGeometry(R, 16, 12, -Math.PI / 16), {
    bone: BONE.head,
    at: at(0, cy, 0),
    keep: (c) => !opening(c),
    color: (c) => {
      const lat = Math.asin(c.clone().normalize().y) / DEG;
      // Bands follow whole rows of the shell (rows are 15 degrees), so their edges run straight.
      if (lat < -46) return deep;
      // A stripe over the crown, front to back, stopping above the roundel.
      if (Math.abs(c.z) < 0.6 && (lat > 31 || (c.x > 0 && lat > 16))) return WHITE;
      return bright;
    },
  });
  // The visor, flipped up over the opening.
  rig.add(new THREE.SphereGeometry(R + 0.16, 10, 1, Math.PI - 66 * DEG, 132 * DEG, 44 * DEG, 15 * DEG), { bone: BONE.head, at: at(0, cy, 0), color: SMOKE });
  // A dark gasket round the opening: under the visor, along the chin, down each side.
  rig.add(new THREE.SphereGeometry(R + 0.06, 10, 1, Math.PI - 60 * DEG, 120 * DEG, 58 * DEG, 3.5 * DEG), { bone: BONE.head, at: at(0, cy, 0), color: DARK });
  rig.add(new THREE.SphereGeometry(R + 0.06, 10, 1, Math.PI - 60 * DEG, 120 * DEG, 118.5 * DEG, 4 * DEG), { bone: BONE.head, at: at(0, cy, 0), color: DARK });
  for (const side of [-1, 1]) {
    const from = side < 0 ? Math.PI - 60 * DEG : Math.PI + 55 * DEG;
    rig.add(new THREE.SphereGeometry(R + 0.06, 1, 6, from, 5 * DEG, 58 * DEG, 64.5 * DEG), { bone: BONE.head, at: at(0, cy, 0), color: DARK });
  }
  // The face, inside the opening.
  decal.add(new THREE.SphereGeometry(R - 0.24, 10, 6, Math.PI - 64 * DEG, 128 * DEG, 52 * DEG, 76 * DEG), frontUv(HEAD.span), at(0, cy, 0));
  // The number on the back.
  const ry = R * Math.sin(6 * DEG);
  decal.add(new THREE.SphereGeometry(R + 0.03, 8, 8, -32 * DEG, 64 * DEG, 54 * DEG, 64 * DEG), backUv(3.9, ry), at(0, cy, 0));
}

/** The token: a springy neck and a thick puck, the avatar on its face and the number on its back. */
function addToken(rig: Rig, decal: Decal, tone: [string, string], neckY: number, headY: number) {
  const [deep, bright] = tone;
  const L = headY - neckY + 0.5;
  // A coil spring from the collar to the puck, bending with the head.
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * 3.25;
      return target.set(Math.cos(a) * 0.62, -0.25 + t * L, Math.sin(a) * 0.62);
    }
  }
  rig.add(new THREE.TubeGeometry(new Helix(), 30, 0.21, 4, false), {
    bone: BONE.neck,
    bone2: BONE.head,
    at: at(0, neckY, 0),
    blend: (p) => (p.y + 0.25) / L,
    color: METAL,
  });
  rig.add(new THREE.CylinderGeometry(0.55, 0.62, 0.5, 8), { bone: BONE.neck, color: DARK, at: at(0, neckY + 0.1, 0) });
  rig.add(new THREE.CylinderGeometry(0.48, 0.62, 0.8, 8), { bone: BONE.head, color: DARK, at: at(0, headY + 0.15, 0) });
  // The puck: its edge in the bright color, a white rim round each face.
  const py = headY + HEAD.puckC;
  const R = HEAD.puckR;
  const T = HEAD.puckT;
  const band = new THREE.CylinderGeometry(R, R, T, 28, 1, true);
  band.rotateZ(Math.PI / 2);
  rig.add(band, { bone: BONE.head, color: bright, at: at(0, py, 0) });
  const rimF = new THREE.RingGeometry(HEAD.puckFace - 0.02, R, 28, 1);
  rimF.rotateY(Math.PI / 2);
  rig.add(rimF, { bone: BONE.head, color: WHITE, at: at(T / 2, py, 0) });
  const rimB = new THREE.RingGeometry(HEAD.puckFace - 0.02, R, 28, 1);
  rimB.rotateY(-Math.PI / 2);
  rig.add(rimB, { bone: BONE.head, color: WHITE, at: at(-T / 2, py, 0) });
  // A thin deep line where the band meets each rim.
  for (const x of [-T / 2 + 0.12, T / 2 - 0.12]) {
    const ring = new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.14, 28, 1, true);
    ring.rotateZ(Math.PI / 2);
    rig.add(ring, { bone: BONE.head, color: deep, at: at(x, py, 0) });
  }
  const face = new THREE.CircleGeometry(HEAD.puckFace, 28);
  face.rotateY(Math.PI / 2);
  decal.add(face, frontUv(HEAD.puckFace * 2), at(T / 2 + 0.01, py, 0));
  const back = new THREE.CircleGeometry(HEAD.puckFace, 28);
  back.rotateY(-Math.PI / 2);
  decal.add(back, backUv(HEAD.puckFace * 2), at(-T / 2 - 0.01, py, 0));
}

/** Hair shapes, roughly following DiceBear Adventurer's styles. */
type HairShape = "crop" | "fringe" | "spiky" | "mohawk" | "topknot" | "curly" | "buzz" | "bob" | "long" | "bun" | "buns" | "pigtails" | "ponytail" | "wavy";
const HAIR: Record<string, HairShape> = {
  short01: "fringe", short02: "fringe", short03: "curly", short04: "crop", short05: "topknot", short06: "fringe", short07: "crop", short08: "crop",
  short09: "fringe", short10: "crop", short11: "crop", short12: "topknot", short13: "buzz", short14: "crop", short15: "mohawk", short16: "spiky",
  short17: "spiky", short18: "spiky", short19: "buzz",
  long01: "bob", long02: "bob", long03: "curly", long04: "long", long05: "bob", long06: "wavy", long07: "long", long08: "long", long09: "long",
  long10: "bun", long11: "bun", long12: "bun", long13: "buns", long14: "pigtails", long15: "pigtails", long16: "ponytail", long17: "wavy",
  long18: "wavy", long19: "ponytail", long20: "bob", long21: "bob", long22: "wavy", long23: "buns", long24: "wavy", long25: "bob", long26: "bob",
};

export function hairShape(style: string | null): HairShape | null {
  if (!style) return null;
  return HAIR[style] ?? (style.startsWith("long") ? "long" : "crop");
}

/** A low-poly head from the avatar's look: skin, ears, a nose, hair in its color and rough style, the face on the front. */
function addBuilt(rig: Rig, decal: Decal, art: CharacterArt, headY: number) {
  const R = HEAD.builtR;
  const cy = headY + HEAD.builtC;
  const skin = art.traits.skin;
  const sx = 0.98;
  const sy = 1.05;
  const sz = 0.97;
  const front = (c: THREE.Vector3) => c.x > R * 0.2;
  const head = () => {
    const g = new THREE.SphereGeometry(R, 14, 10, -Math.PI / 14);
    g.scale(sx, sy, sz);
    return g;
  };
  rig.add(head(), { bone: BONE.head, at: at(0, cy, 0), keep: (c) => !front(c), color: skin });
  decal.add(head(), frontUv(HEAD.span), at(0, cy, 0), front);
  for (const z of [-1, 1]) rig.add(new THREE.IcosahedronGeometry(0.72, 0), { bone: BONE.head, color: skin, at: at(0.1, cy - 0.15, z * R * sz, 0, 0, 0, 0.55, 1, 0.8) });
  rig.add(new THREE.IcosahedronGeometry(0.42, 0), { bone: BONE.head, color: mixHex(skin, "#7a4a2a", 0.12), at: at(R * sx - 0.05, cy - 0.45, 0, 0, 0, 0, 1.1, 0.85, 0.9) });

  const shape = hairShape(art.traits.hairStyle);
  if (!shape || !art.traits.hair) return;
  const hc = art.traits.hair;
  const hr = R + 0.3;
  // The cap: a shell over the top and back, cut at the hairline.
  const cap = (frontLine: number, backLine: number, color: Tint = hc) => {
    const g = new THREE.SphereGeometry(hr, 14, 10, -Math.PI / 14);
    g.scale(sx, sy, sz);
    rig.add(g, {
      bone: BONE.head,
      at: at(0, cy, 0),
      color,
      keep: (c) => {
        const d = c.clone().normalize();
        const t = (d.x + 1) / 2;
        const line = backLine + (frontLine - backLine) * t * t;
        return d.y > line;
      },
    });
  };
  const blob = (r: number, x: number, y: number, z: number, s = 1) => rig.add(new THREE.IcosahedronGeometry(r, 0), { bone: BONE.head, color: hc, at: at(x, cy + y, z, 0.3, 0.5, 0.2, s) });
  const spike = (x: number, y: number, z: number, rx: number, rz: number, h = 2.2, r = 0.85) => {
    const g = new THREE.ConeGeometry(r, h, 5);
    g.translate(0, h / 2, 0);
    rig.add(g, { bone: BONE.head, color: hc, at: at(x, cy + y, z, rx, 0, rz) });
  };
  // A curtain of hair round the back and sides, from `top` down to `bottom`, flaring out a little.
  const curtain = (top: number, bottom: number, flare: number, open = 64) => {
    const h = top - bottom;
    const make = () => new THREE.CylinderGeometry(hr * 0.98, hr + flare, h, 14, 1, true, Math.PI / 2 + open * DEG, Math.PI * 2 - 2 * open * DEG);
    rig.add(make(), { bone: BONE.head, color: hc, at: at(0, cy + bottom + h / 2, 0) });
    // Its inside (the same shape mirrored across, so it faces in), a shade darker.
    rig.add(make(), { bone: BONE.head, color: mixHex(hc, "#000000", 0.25), at: at(0, cy + bottom + h / 2, 0, 0, 0, 0, 0.97, 1, -0.97) });
  };
  switch (shape) {
    case "crop":
      cap(0.42, -0.32);
      break;
    case "buzz":
      cap(0.5, -0.25, mixHex(hc, skin, 0.45));
      break;
    case "fringe":
      cap(0.28, -0.35);
      blob(1.2, R * 0.72, R * 0.62, -0.9, 1.15);
      blob(1.0, R * 0.78, R * 0.5, 0.6);
      break;
    case "spiky":
      cap(0.42, -0.3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spike(Math.cos(a) * 1.5 - 0.3, R * 0.7, Math.sin(a) * 1.5, Math.sin(a) * 0.5, -Math.cos(a) * 0.5 + 0.15);
      }
      spike(-0.2, R * 0.85, 0, 0, 0.1, 2.4);
      break;
    case "mohawk":
      cap(0.55, -0.2, mixHex(hc, skin, 0.6));
      for (let i = 0; i < 5; i++) {
        const x = R * (0.62 - i * 0.31);
        const y = Math.sqrt(Math.max(0, R * R - x * x)) * sy - 0.35;
        spike(x, y, 0, 0, -0.45 + i * 0.22, 2.7 - Math.abs(i - 1.5) * 0.3, 0.8);
      }
      break;
    case "topknot":
      cap(0.42, -0.3);
      blob(1.15, -0.4, R * 1.12, 0);
      break;
    case "curly":
      cap(0.32, -0.38);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        blob(1.05, Math.cos(a) * R * 0.62, R * 0.62 + Math.sin(a * 2) * 0.2, Math.sin(a) * R * 0.7);
      }
      break;
    case "bob":
      cap(0.32, -0.4);
      curtain(R * 0.35, -R * 0.62, 0.35);
      break;
    case "long":
      cap(0.32, -0.4);
      curtain(R * 0.35, -R * 1.45, 0.75, 62);
      break;
    case "wavy":
      cap(0.32, -0.4);
      curtain(R * 0.35, -R * 1.3, 1.0, 60);
      for (const z of [-1, 1]) blob(1.15, -0.4, -R * 0.9, z * (R + 0.4));
      blob(1.25, -R * 0.95, -R * 0.85, 0);
      break;
    case "bun":
      cap(0.32, -0.38);
      curtain(R * 0.3, -R * 0.45, 0.25, 70);
      blob(1.3, -0.6, R * 1.12, 0);
      break;
    case "buns":
      cap(0.32, -0.38);
      for (const z of [-1, 1]) blob(1.1, -0.3, R * 0.95, z * R * 0.62);
      break;
    case "pigtails":
      cap(0.32, -0.38);
      for (const z of [-1, 1]) {
        blob(0.75, -0.3, R * 0.35, z * (R + 0.35));
        const g = new THREE.ConeGeometry(0.95, 3.4, 6);
        g.rotateX(Math.PI);
        rig.add(g, { bone: BONE.head, color: hc, at: at(-0.4, cy - R * 0.25, z * (R + 1.0), -z * 0.45, 0, 0) });
      }
      break;
    case "ponytail": {
      cap(0.32, -0.38);
      blob(0.7, -R * 0.92, R * 0.55, 0);
      const g = new THREE.ConeGeometry(1.05, 4.6, 6);
      g.rotateX(Math.PI);
      rig.add(g, { bone: BONE.head, color: hc, at: at(-R * 1.15, cy - R * 0.05, 0, 0, 0, -0.5) });
      break;
    }
  }
}

/** The cutout: the avatar's die-cut outline extruded to a thick sticker (white edge), its chin at the origin, facing +x. */
export function stickerGeometry(art: CharacterArt): THREE.BufferGeometry {
  const st = art.sticker!;
  const size = 3.5 / st.headR;
  const [chx, chy] = st.chin;
  const shape = new THREE.Shape(st.outline.map(([x, y]) => new THREE.Vector2((x - chx) * size, (chy - y) * size)));
  const depth = 0.7;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const p = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const caps = g.groups[0];
  for (let i = 0; i < p.count; i++) {
    const isCap = caps && i >= caps.start && i < caps.start + caps.count;
    if (isCap) {
      const px = p.getX(i) / size + chx;
      const py = chy - p.getY(i) / size;
      uv.setXY(i, px * 0.5, 1 - py);
    } else uv.setXY(i, 0.75, 0.5);
  }
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

export interface HeadParts {
  /** The textured part (face, roundel, puck faces), in character space; null for the cutout (built separately). */
  decal: THREE.BufferGeometry | null;
  /** Whether the textured part needs alpha testing (the helmet's roundel). */
  cutAlpha: boolean;
}

/**
 * Builds a character's skinned geometry (body and the untextured head) and its
 * textured head part. Geometry is in the bind pose; the textured part is in
 * character space too and is re-based on the head bone by the caller.
 */
export function buildCharacter(art: CharacterArt): { body: THREE.BufferGeometry; head: HeadParts; triangles: number } {
  const look = art.look;
  const W = restWorld(look);
  const neckY = W[BONE.neck].y;
  const headY = W[BONE.head].y;
  const neckColor = look === "helmet" ? DARK : art.traits.skin;
  const rig = new Rig();
  addBody(rig, look, art.spec.tone, neckColor);
  const decal = new Decal();
  if (look === "helmet") addHelmet(rig, decal, art.spec.tone, headY);
  else if (look === "token") addToken(rig, decal, art.spec.tone, neckY, headY);
  else if (look === "built") addBuilt(rig, decal, art, headY);
  const tris = rig.triangles;
  return { body: rig.build(), head: { decal: decal.empty ? null : decal.build(), cutAlpha: look === "helmet" }, triangles: tris };
}

/** The jetpack (not skinned; it rides on the spine bone): two tanks, nozzles, a back plate and straps. In spine-bone space. */
export function packGeometry(tone: [string, string]): THREE.BufferGeometry {
  const [deep, bright] = tone;
  const rig = new Rig();
  for (const z of [-1.05, 1.05]) {
    rig.add(new THREE.CylinderGeometry(0.95, 0.95, 4.0, 8), { bone: 0, color: METAL, at: at(-2.5, 2.8, z) });
    rig.add(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 8), { bone: 0, color: deep, at: at(-2.5, 3.4, z) });
    rig.add(new THREE.ConeGeometry(0.95, 0.9, 8), { bone: 0, color: bright, at: at(-2.5, 5.25, z) });
    rig.add(new THREE.CylinderGeometry(0.42, 0.62, 0.8, 8), { bone: 0, color: DARK, at: at(-2.5, 0.4, z) });
  }
  rig.add(new THREE.BoxGeometry(0.5, 4.2, 3.2), { bone: 0, color: DARK, at: at(-1.95, 2.8, 0) });
  for (const z of [-1.35, 1.35]) {
    rig.add(new THREE.BoxGeometry(3.9, 0.36, 0.7), { bone: 0, color: DARK, at: at(-0.1, 5.32, z) });
    rig.add(new THREE.BoxGeometry(0.3, 3.6, 0.7), { bone: 0, color: DARK, at: at(1.86, 3.4, z, 0, 0, 0.06) });
  }
  const g = rig.build();
  g.deleteAttribute("skinIndex");
  g.deleteAttribute("skinWeight");
  return g;
}

/** Jetpack flames: two cones pointing down from the nozzles, hot in the middle. In pack space. */
export function flameGeometry(): THREE.BufferGeometry {
  const rig = new Rig();
  for (const z of [-1.05, 1.05]) {
    const outer = new THREE.ConeGeometry(0.6, 2.8, 8, 1, true);
    outer.rotateX(Math.PI);
    rig.add(outer, { bone: 0, color: "#ff7a1c", at: at(-2.5, -1.4, z) });
    const inner = new THREE.ConeGeometry(0.34, 1.7, 8, 1, true);
    inner.rotateX(Math.PI);
    rig.add(inner, { bone: 0, color: "#fff1a8", at: at(-2.5, -0.85, z) });
  }
  const g = rig.build();
  g.deleteAttribute("skinIndex");
  g.deleteAttribute("skinWeight");
  return g;
}
