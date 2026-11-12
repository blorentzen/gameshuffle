/**
 * The track in 3D (client, three.js), built once per race from the track
 * (src/lib/kart/track.ts) and its colors (content.ts). Nothing here changes
 * how the race drives: the road, curbs and sidewalks follow the centerline the
 * physics uses, the hedge stands where the physics has walls, every solid prop
 * is drawn inside its collider, and the houses, fences and parked cars stand
 * outside the hedge where no kart can reach.
 *
 * Draw calls are kept low: everything flat and colored is merged into a few
 * vertex-colored meshes (the town is one), repeated things (trees, bushes,
 * flowers, hedge blocks) are instanced, and the flat ground pictures use world
 * coordinates, so pieces that overlap match exactly.
 */

import * as THREE from "three";
import { PROP_LOOK, TRACK_LOOK } from "@/lib/kart/content";
import { seeded } from "@/lib/kart/rng";
import { TONE_COLORS } from "@/lib/kart/roster";
import { nearest, type Track } from "@/lib/kart/track";
import { at, atR, Mesher, mix, paintMaterial, tint } from "./mesher";
import { parkedCar } from "./rides";
import { TILE, type Pictures } from "./textures";

/** Heights above the lawn: the road, its markings, the puddle, the sidewalk. */
export const ROAD_Y = 0.12;
const MARK_Y = 0.2;
const SIDEWALK_Y = 0.9;
/** The arch's crossbeam: high enough that the chase camera always passes under its banner. */
const ARCH_TOP = 72;

export interface World {
  group: THREE.Group;
  /** Hidden in low quality. */
  extras: THREE.Object3D[];
  /** Instanced meshes that show fewer instances in low quality: [mesh, all, low]. */
  thinned: [THREE.InstancedMesh, number, number][];
  /** Sprinklers on the lawns, in three.js coordinates. */
  sprinklers: THREE.Vector3[];
  dispose(): void;
}

/** A world point (map x, map y, height) as a three.js vector. */
export function v3(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, z, y);
}

/** Flat pieces lying on the ground, wound to face up, with planar or custom texture coordinates. */
class Flat {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  constructor(private planar: number | null, private color: THREE.Color | null = null) {}
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], ta?: [number, number], tb?: [number, number], tc?: [number, number], color?: THREE.Color) {
    // Points are (map x, height, map y); the triangle must face up (+y).
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    const up = uz * vx - ux * vz;
    if (Math.abs(up) < 1e-9) return;
    if (up < 0) {
      [b, c] = [c, b];
      [tb, tc] = [tc, tb];
    }
    for (const [p, t] of [[a, ta], [b, tb], [c, tc]] as const) {
      this.pos.push(p[0], p[1], p[2]);
      if (this.planar) this.uv.push(p[0] / this.planar, p[2] / this.planar);
      else this.uv.push(t ? t[0] : 0, t ? t[1] : 0);
      const cc = color ?? this.color;
      if (cc) this.col.push(cc.r, cc.g, cc.b);
    }
  }
  quad(a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], ta?: [number, number], tb?: [number, number], tc?: [number, number], td?: [number, number], color?: THREE.Color) {
    this.tri(a, b, c, ta, tb, tc, color);
    this.tri(a, c, d, ta, tc, td, color);
  }
  disc(x: number, y: number, h: number, r: number, sides = 20, color?: THREE.Color) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      this.tri([x, h, y], [x + Math.cos(a0) * r, h, y + Math.sin(a0) * r], [x + Math.cos(a1) * r, h, y + Math.sin(a1) * r], undefined, undefined, undefined, color);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    const n = new Float32Array(this.pos.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Signed curvature at each sample (smoothed): the curve's center is at 1/k along the left normal. */
function curvature(track: Track): Float64Array {
  const { n, tx, ty } = track;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(ty[i], tx[i]);
    const b = Math.atan2(ty[(i + 1) % n], tx[(i + 1) % n]);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    raw[i] = d / (track.length / n);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += raw[(i + k + n) % n];
    out[i] = s / 7;
  }
  return out;
}

/** How far a map point is outside the road (negative = on it). */
function clearance(track: Track, x: number, y: number): number {
  const nr = nearest(track, x, y);
  return nr.dist - nr.hw;
}

/** On a part of the road more than `gap` samples away from sample i? */
function onOtherRoad(track: Track, x: number, y: number, i: number, gap = 24): boolean {
  const { n, xs, ys, hw } = track;
  for (let j = 0; j < n; j++) {
    const d = Math.abs(j - i);
    if (Math.min(d, n - d) <= gap) continue;
    const dx = xs[j] - x;
    const dy = ys[j] - y;
    if (dx * dx + dy * dy < hw[j] * hw[j]) return true;
  }
  return false;
}

function material(map: THREE.Texture | null, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map, ...extra });
}

export function buildWorld(track: Track, pics: Pictures): World {
  const L = TRACK_LOOK;
  const group = new THREE.Group();
  const extras: THREE.Object3D[] = [];
  const thinned: [THREE.InstancedMesh, number, number][] = [];
  const disposables: { dispose(): void }[] = [];
  const rnd = seeded(track.mirror ? 4242 : 2424);
  const { n, xs, ys, hw, tx, ty } = track;
  const kap = curvature(track);
  const b = track.bounds;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, opts: { cast?: boolean; receive?: boolean; order?: number; extra?: boolean } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !!opts.cast;
    m.receiveShadow = opts.receive !== false;
    if (opts.order !== undefined) m.renderOrder = opts.order;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    if (opts.extra) extras.push(m);
    disposables.push(geo, mat);
    return m;
  };

  // ── The lawn, everywhere ──
  {
    const size = 14000;
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cy);
    const uv = g.getAttribute("uv");
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / TILE.lawn, p.getZ(i) / TILE.lawn);
    add(g, material(pics.lawn));
  }

  // ── The road: a strip along the centerline that never folds, plus discs at the tightest apexes ──
  const leftOf = (i: number, o: number): [number, number] => [xs[i] - ty[i] * o, ys[i] + tx[i] * o];
  const safe = (i: number, o: number) => (o * kap[i] > 0.88 ? 0.88 / kap[i] : o);
  {
    const road = new Flat(TILE.asphalt);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [ax, ay] = leftOf(i, safe(i, hw[i]));
      const [bx, by] = leftOf(i, safe(i, -hw[i]));
      const [cx2, cy2] = leftOf(j, safe(j, -hw[j]));
      const [dx, dy] = leftOf(j, safe(j, hw[j]));
      road.quad([ax, ROAD_Y, ay], [bx, ROAD_Y, by], [cx2, ROAD_Y, cy2], [dx, ROAD_Y, dy]);
      if (Math.abs(kap[i]) * hw[i] > 0.85 && i % 2 === 0) road.disc(xs[i], ys[i], ROAD_Y, hw[i], 22);
    }
    add(road.build(), material(pics.asphalt, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  }

  // ── Road lines: white edge lines, a yellow dashed center line, the start grid ──
  {
    const lines = new Flat(null);
    const dashes = new Flat(null);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const step = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
      for (const side of [1, -1]) {
        const oi = side * hw[i] * 0.9;
        const oj = side * hw[j] * 0.9;
        if (oi * kap[i] > 0.8 || oj * kap[j] > 0.8) continue;
        const [x0, y0] = leftOf(i, oi);
        const [x1, y1] = leftOf(j, oj);
        if (onOtherRoad(track, x0, y0, i) || onOtherRoad(track, x1, y1, j)) continue;
        const w = 1.9;
        const a = leftOf(i, oi + w), bb = leftOf(i, oi - w), c = leftOf(j, oj - w), d = leftOf(j, oj + w);
        lines.quad([a[0], MARK_Y, a[1]], [bb[0], MARK_Y, bb[1]], [c[0], MARK_Y, c[1]], [d[0], MARK_Y, d[1]], [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      if (hw[i] < 80 && hw[j] < 80 && i > 2 && i < n - 2) {
        const w = 1.5;
        const a = leftOf(i, w), bb = leftOf(i, -w), c = leftOf(j, -w), d = leftOf(j, w);
        dashes.quad([a[0], MARK_Y, a[1]], [bb[0], MARK_Y, bb[1]], [c[0], MARK_Y, c[1]], [d[0], MARK_Y, d[1]], [0, s / 44], [1, s / 44], [1, (s + step) / 44], [0, (s + step) / 44]);
      }
      s += step;
    }
    // The start grid: a box for each of four places behind the line.
    const fx = Math.cos(track.start.h);
    const fy = Math.sin(track.start.h);
    for (let slot = 0; slot < 4; slot++) {
      const row = Math.floor(slot / 2);
      const side = slot % 2 === 0 ? -1 : 1;
      const gx = track.start.x - fx * row * 30 - fy * side * 24 + fx * 6;
      const gy = track.start.y - fy * row * 30 + fx * side * 24 + fy * 6;
      const bar = (along0: number, along1: number, across0: number, across1: number) => {
        const p = (al: number, ac: number): [number, number, number] => [gx + fx * al - fy * ac, MARK_Y, gy + fy * al + fx * ac];
        lines.quad(p(along0, across0), p(along0, across1), p(along1, across1), p(along1, across0), [0, 0], [1, 0], [1, 1], [0, 1]);
      };
      bar(-1.4, 1.4, -11, 11);
      bar(-14, 0, -11, -8.4);
      bar(-14, 0, 8.4, 11);
    }
    add(lines.build(), material(pics.line, { color: L.edgeLine, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { order: 1 });
    add(dashes.build(), material(pics.dash, { color: L.centerLine, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { order: 1 });
  }

  // ── The finish line ──
  {
    const f = new Flat(null);
    const w = hw[0];
    const ax = tx[0], ay = ty[0];
    const p = (al: number, ac: number): [number, number, number] => [xs[0] + ax * al - ay * ac, MARK_Y + 0.02, ys[0] + ay * al + ax * ac];
    f.quad(p(-8, -w), p(-8, w), p(8, w), p(8, -w), [0, 0], [(2 * w) / 16, 0], [(2 * w) / 16, 1], [0, 1]);
    add(f.build(), material(pics.checker, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  }

  // ── Curbs: red and white on the bends, plain concrete along the straights ──
  {
    const red = tint(L.curb[0]);
    const white = tint(L.curb[1]);
    const concrete = tint(L.concrete);
    const bend = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (Math.abs(kap[i]) > 1 / 300) for (let k = -3; k <= 3; k++) bend[(i + k + n) % n] = 1;
    const tri: number[] = [];
    const cols: THREE.Color[] = [];
    const face = (p: [number, number, number][], c: THREE.Color) => {
      tri.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
      cols.push(c, c);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const side of [1, -1]) {
        const racing = bend[i] === 1;
        const width = racing ? 10 : 3.2;
        const h = racing ? 0.55 : 0.95;
        const o0i = side * (hw[i] + 0.2), o0j = side * (hw[j] + 0.2);
        const o1i = side * (hw[i] + width), o1j = side * (hw[j] + width);
        if (o1i * kap[i] > 0.85 || o1j * kap[j] > 0.85) continue;
        const pi0 = leftOf(i, o0i), pj0 = leftOf(j, o0j), pi1 = leftOf(i, o1i), pj1 = leftOf(j, o1j);
        if (clearance(track, pi1[0], pi1[1]) < width - 1.5 || clearance(track, pj1[0], pj1[1]) < width - 1.5) continue;
        if (clearance(track, pi0[0], pi0[1]) < -0.5 || clearance(track, pj0[0], pj0[1]) < -0.5) continue;
        const c = racing ? (Math.floor(i / 2) % 2 === 0 ? red : white) : concrete;
        const top = (p: [number, number], y: number): [number, number, number] => [p[0], y, p[1]];
        // Top (sloped down to the outside on the bends), and the face toward the road.
        face([top(pi0, ROAD_Y + h), top(pj0, ROAD_Y + h), top(pj1, racing ? ROAD_Y + 0.05 : ROAD_Y + h), top(pi1, racing ? ROAD_Y + 0.05 : ROAD_Y + h)], c);
        face([top(pi0, ROAD_Y), top(pj0, ROAD_Y), top(pj0, ROAD_Y + h), top(pi0, ROAD_Y + h)], c.clone().multiplyScalar(0.82));
      }
    }
    const col: number[] = [];
    for (const c of cols) for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    const built = new THREE.BufferGeometry();
    built.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
    built.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    built.computeVertexNormals();
    add(built, paintMaterial({ side: THREE.DoubleSide }));
  }

  // ── Sidewalks: a grass verge, then a slab on both sides wherever there's room ──
  {
    const top = new Flat(TILE.sidewalk);
    const edges: number[] = [];
    const in0 = 16, in1 = 33;
    const ok = (x: number, y: number) =>
      clearance(track, x, y) > 12 &&
      x > b.x0 + 6 && x < b.x1 - 6 && y > b.y0 + 6 && y < b.y1 - 6 &&
      track.props.every((p) => p.r === 0 || Math.hypot(p.x - x, p.y - y) > p.r + 4) &&
      track.mats.every((m) => Math.hypot(m.x - x, m.y - y) > Math.max(m.w, m.h) / 2 + 8);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const side of [1, -1]) {
        const a0 = leftOf(i, side * (hw[i] + in0)), a1 = leftOf(i, side * (hw[i] + in1));
        const b0 = leftOf(j, side * (hw[j] + in0)), b1 = leftOf(j, side * (hw[j] + in1));
        if (side * (hw[i] + in1) * kap[i] > 0.85 || side * (hw[j] + in1) * kap[j] > 0.85) continue;
        if (!ok(a0[0], a0[1]) || !ok(a1[0], a1[1]) || !ok(b0[0], b0[1]) || !ok(b1[0], b1[1])) continue;
        top.quad([a0[0], SIDEWALK_Y, a0[1]], [a1[0], SIDEWALK_Y, a1[1]], [b1[0], SIDEWALK_Y, b1[1]], [b0[0], SIDEWALK_Y, b0[1]]);
        for (const [p, q] of [[a0, b0], [a1, b1]]) edges.push(p[0], 0, p[1], q[0], 0, q[1], q[0], SIDEWALK_Y, q[1], p[0], 0, p[1], q[0], SIDEWALK_Y, q[1], p[0], SIDEWALK_Y, p[1]);
      }
    }
    add(top.build(), material(pics.sidewalk));
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
    eg.computeVertexNormals();
    add(eg, material(null, { color: L.concrete, side: THREE.DoubleSide }));
  }

  // ── The puddle (the wet patch): a dark rim and glossy water ──
  {
    const rim = new Flat(null);
    const water = new Flat(null);
    for (const c of track.slick) {
      rim.disc(c.x, c.y, ROAD_Y + 0.08, c.r + 3, 26);
      water.disc(c.x, c.y, ROAD_Y + 0.14, c.r, 26);
    }
    add(rim.build(), material(null, { color: L.puddleEdge, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    add(
      water.build(),
      new THREE.MeshPhongMaterial({ color: L.puddle, specular: "#dfefff", shininess: 70, envMap: pics.sky, reflectivity: 0.3, combine: THREE.MixOperation, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
    );
  }

  // ── The ramp: a wedge of planks with a striped lip ──
  {
    const r = track.ramp;
    const Lr = r.length, w = r.halfWidth, H = r.height;
    const p = (along: number, across: number, z: number): [number, number, number] => [r.x + r.dx * along + r.nx * across, ROAD_Y + z, r.y + r.dy * along + r.ny * across];
    const pos = (pts: [number, number, number][]) => pts.flat();
    const topG = new THREE.BufferGeometry();
    // The deck (u across, v up the ramp), wound to face up.
    const deck = [p(0, -w, 0), p(0, w, 0), p(Lr, w, H), p(0, -w, 0), p(Lr, w, H), p(Lr, -w, H)];
    const up = (deck[1][2] - deck[0][2]) * (deck[2][0] - deck[0][0]) - (deck[1][0] - deck[0][0]) * (deck[2][2] - deck[0][2]);
    const order = up >= 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    topG.setAttribute("position", new THREE.Float32BufferAttribute(order.flatMap((k) => deck[k]), 3));
    topG.setAttribute("uv", new THREE.Float32BufferAttribute(order.flatMap((k) => uvs[k]), 2));
    topG.computeVertexNormals();
    add(topG, material(pics.planks), { cast: true });
    // The lip: the tall end, striped, facing on along the road.
    const lip = new THREE.BufferGeometry();
    const lp = [p(Lr, -w, 0), p(Lr, w, 0), p(Lr, w, H), p(Lr, -w, 0), p(Lr, w, H), p(Lr, -w, H)];
    lip.setAttribute("position", new THREE.Float32BufferAttribute(pos(lp), 3));
    lip.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, (2 * w) / 12, 0, (2 * w) / 12, 1, 0, 0, (2 * w) / 12, 1, 0, 1], 2));
    lip.computeVertexNormals();
    add(lip, material(pics.lip, { side: THREE.DoubleSide }), { cast: true });
    // Its sides.
    const sides = new THREE.BufferGeometry();
    sides.setAttribute("position", new THREE.Float32BufferAttribute(pos([p(0, -w, 0), p(Lr, -w, 0), p(Lr, -w, H), p(0, w, 0), p(Lr, w, 0), p(Lr, w, H)]), 3));
    sides.computeVertexNormals();
    add(sides, material(null, { color: L.rampSide, side: THREE.DoubleSide }), { cast: true });
  }

  // ── Solid props (inside their colliders), flower beds and the arch: one merged mesh ──
  const props = new Mesher();
  const treeSpots: { x: number; y: number; s: number; tone: number; lift?: number }[] = [];
  const bushSpots: { x: number; y: number; s: number; tone: number }[] = [];
  const flowers: { x: number; y: number; c: string }[] = [];
  const sprinklers: THREE.Vector3[] = [];
  const facing = (x: number, y: number) => {
    // Turn so the front (+x model) faces the nearest road point.
    const nr = nearest(track, x, y);
    const k = nr.i;
    return -Math.atan2(ys[k] - y, xs[k] - x);
  };
  for (const pr of track.props) {
    const c = PROP_LOOK[pr.kind as keyof typeof PROP_LOOK]?.colors ?? PROP_LOOK.bush.colors;
    const X = pr.x, Z = pr.y;
    switch (pr.kind) {
      case "tree": {
        // A brick planter the size of the collider, so bumping it makes sense.
        props.cyl(pr.r, pr.r + 1, 4.5, 16, c[3], at(X, 0, Z));
        props.cyl(pr.r - 2.5, pr.r - 2.5, 4.8, 16, L.soil, at(X, 0, Z));
        treeSpots.push({ x: X, y: Z, s: 1.15, tone: 0 });
        break;
      }
      case "bush":
        bushSpots.push({ x: X, y: Z, s: pr.r / 20, tone: 1 });
        break;
      case "cone": {
        props.box(14, 1.4, 14, c[2], at(X, 0, Z, 0.4));
        props.cyl(1.4, 6.6, 16, 12, c[0], at(X, 1.4, Z));
        props.cyl(3.6, 4.9, 4, 12, c[1], at(X, 6.8, Z, 0, 1.03, 1, 1.03));
        break;
      }
      case "rock":
        props.add(new THREE.DodecahedronGeometry(pr.r, 0), c[0], atR(X, pr.r * 0.3, Z, rnd(), rnd() * 3, 0.2).multiply(new THREE.Matrix4().makeScale(1, 0.62, 1)));
        break;
      case "island": {
        props.cyl(pr.r, pr.r + 1.5, 3.5, 28, c[0], at(X, ROAD_Y, Z));
        props.cyl(pr.r - 3, pr.r - 3, 3.8, 28, c[1], at(X, ROAD_Y, Z));
        treeSpots.push({ x: X, y: Z, s: 0.7, tone: 2, lift: ROAD_Y + 3.8 });
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2;
          flowers.push({ x: X + Math.cos(a) * (pr.r - 9), y: Z + Math.sin(a) * (pr.r - 9), c: k % 2 ? "#f2c94c" : "#ffffff" });
        }
        break;
      }
      case "mailbox": {
        const f = facing(X, Z);
        props.cyl(pr.r, pr.r, 1.2, 12, L.concrete, at(X, 0, Z));
        props.box(2.4, 18, 2.4, c[1], at(X, 1.2, Z, f));
        mailbox(props, X, Z, f, c[0], c[2], 19);
        break;
      }
      case "stand": {
        const f = facing(X, Z);
        lemonadeStand(props, X, Z, f);
        // Its sign, on the front panel.
        const g = new THREE.PlaneGeometry(22, 5.5);
        g.rotateY(Math.PI / 2 + f);
        g.translate(X + Math.cos(f) * 6.8, 6.4, Z - Math.sin(f) * 6.8);
        add(g, material(pics.sign), { cast: false });
        break;
      }
      case "car": {
        const nr = nearest(track, X, Z);
        const ang = Math.atan2(ty[nr.i], tx[nr.i]);
        props.add(parkedCar(c[0]), null, at(X, 0, Z, -ang), true);
        break;
      }
      case "sprinkler": {
        props.cyl(1.2, 1.6, 3, 8, c[0], at(X, 0, Z));
        sprinklers.push(new THREE.Vector3(X, 3, Z));
        break;
      }
      default:
        bushSpots.push({ x: X, y: Z, s: 1, tone: 1 });
    }
  }
  // Flower beds: soil and blooms in their tile colors.
  for (const m of track.mats) {
    const [c0, c1] = TONE_COLORS[m.tone] ?? TONE_COLORS.blue;
    const r = Math.min(m.w, m.h) / 2;
    const shape = new THREE.Shape();
    const hw2 = m.w / 2 - r, hh2 = m.h / 2 - r;
    shape.absarc(hw2, hh2, r, 0, Math.PI / 2, false);
    shape.absarc(-hw2, hh2, r, Math.PI / 2, Math.PI, false);
    shape.absarc(-hw2, -hh2, r, Math.PI, Math.PI * 1.5, false);
    shape.absarc(hw2, -hh2, r, Math.PI * 1.5, Math.PI * 2, false);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(Math.PI / 2);
    g.translate(0, 1.6, 0);
    props.add(g, L.soil, at(m.x, 0, m.y, -m.angle));
    const count = Math.round((m.w * m.h) / 160);
    for (let i = 0; i < count; i++) {
      const lx = (rnd() - 0.5) * (m.w - 12);
      const ly = (rnd() - 0.5) * (m.h - 12);
      const ca = Math.cos(m.angle), sa = Math.sin(m.angle);
      flowers.push({ x: m.x + lx * ca - ly * sa, y: m.y + lx * sa + ly * ca, c: rnd() < 0.5 ? c0 : c1 });
    }
  }
  // Wet lawn round each sprinkler.
  {
    const wet = new Flat(null);
    for (const s of sprinklers) wet.disc(s.x, s.z, 0.05, 46, 22);
    if (sprinklers.length) add(wet.build(), material(null, { color: mix(L.grass[0], "#1f5d2c", 0.35), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  }

  // The start/finish arch.
  {
    const w = hw[0] + 11;
    const f = -Math.atan2(ty[0], tx[0]);
    const nx = -ty[0], ny = tx[0];
    for (const side of [-1, 1]) {
      const px = xs[0] + nx * w * side;
      const pz = ys[0] + ny * w * side;
      props.box(7, 5, 7, L.arch[1], at(px, 0, pz, f));
      props.box(5.5, ARCH_TOP - 4, 5.5, L.arch[0], at(px, 5, pz, f));
      props.box(7, 4, 7, L.arch[1], at(px, ARCH_TOP, pz, f));
    }
    props.box(6, 5, 2 * w + 7, L.arch[1], at(xs[0], ARCH_TOP + 2, ys[0], f));
    props.box(5, 1.2, 2 * w + 2, L.arch[0], at(xs[0], ARCH_TOP + 7, ys[0], f));
    const bw = 2 * hw[0] * 0.88;
    for (const flip of [0, Math.PI]) {
      const g = new THREE.PlaneGeometry(bw, bw * (224 / 1024));
      g.rotateY(f + Math.PI / 2 + flip);
      g.translate(xs[0] + tx[0] * (flip ? -0.35 : 0.35), ARCH_TOP + 2 - (bw * 224) / 2048 - 0.3, ys[0] + ty[0] * (flip ? -0.35 : 0.35));
      add(g, material(pics.banner), { cast: true });
    }
  }
  add(props.build(), paintMaterial(), { cast: true });

  // ── The hedge round the edge (the walls), instanced blocks ──
  {
    const block = new Mesher();
    block.box(1, 1, 1, "#ffffff", at(0, 0, 0));
    for (const [x, z, s] of [[-0.22, 0.05, 0.46], [0.24, -0.05, 0.44]] as const) block.blob(s, "#e8f2e0", at(x, 0.95, z, 0, 1, 0.55, 1.1));
    const geo = block.build();
    const segs: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const D = 24;
    const H = 15;
    const run = (x0: number, y0: number, x1: number, y1: number, out: [number, number]) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const count = Math.ceil(len / 44);
      const ang = -Math.atan2(y1 - y0, x1 - x0);
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const x = x0 + (x1 - x0) * t + out[0] * D / 2;
        const y = y0 + (y1 - y0) * t + out[1] * D / 2;
        const h = H * (0.92 + rnd() * 0.16);
        segs.push(at(x, 0, y, ang, len / count + 2, h, D));
        cols.push(mix(L.boundary, L.boundaryTop, rnd() * 0.6));
      }
    };
    run(b.x0 - D, b.y0, b.x1 + D, b.y0, [0, -1]);
    run(b.x0 - D, b.y1, b.x1 + D, b.y1, [0, 1]);
    run(b.x0, b.y0, b.x0, b.y1, [-1, 0]);
    run(b.x1, b.y0, b.x1, b.y1, [1, 0]);
    const mesh = new THREE.InstancedMesh(geo, paintMaterial(), segs.length);
    segs.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, cols[i]);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(geo, mesh.material as THREE.Material);
  }

  // ── Outside the hedge: a sidewalk, a street, and houses facing the track ──
  // One town mesh and one extras mesh per side, so each side can be culled (and kept out of the shadow pass).
  const towns: Mesher[] = [];
  const extraSides: Mesher[] = [];
  {
    const street = new Flat(TILE.asphalt);
    const walk = new Flat(TILE.sidewalk);
    const yellow = new Flat(null);
    // A ring between `d0` and `d1` outside the walls.
    const ring = (f: Flat, d0: number, d1: number, y: number) => {
      const q = (x0: number, y0: number, x1: number, y1: number) => f.quad([x0, y, y0], [x1, y, y0], [x1, y, y1], [x0, y, y1]);
      q(b.x0 - d1, b.y0 - d1, b.x1 + d1, b.y0 - d0);
      q(b.x0 - d1, b.y1 + d0, b.x1 + d1, b.y1 + d1);
      q(b.x0 - d1, b.y0 - d0, b.x0 - d0, b.y1 + d0);
      q(b.x1 + d0, b.y0 - d0, b.x1 + d1, b.y1 + d0);
    };
    ring(walk, 26, 44, SIDEWALK_Y);
    ring(street, 44, 124, ROAD_Y);
    ring(walk, 124, 142, SIDEWALK_Y);
    // Dashed center line on the street.
    const dash = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      for (let s = 30; s < len - 30; s += 44) {
        const a = [x0 + ux * s, y0 + uy * s], c = [x0 + ux * (s + 22), y0 + uy * (s + 22)];
        yellow.quad([a[0] - uy * 1.4, MARK_Y, a[1] + ux * 1.4], [a[0] + uy * 1.4, MARK_Y, a[1] - ux * 1.4], [c[0] + uy * 1.4, MARK_Y, c[1] - ux * 1.4], [c[0] - uy * 1.4, MARK_Y, c[1] + ux * 1.4], [0, 0], [1, 0], [1, 1], [0, 1]);
      }
    };
    dash(b.x0 - 84, b.y0 - 84, b.x1 + 84, b.y0 - 84);
    dash(b.x0 - 84, b.y1 + 84, b.x1 + 84, b.y1 + 84);
    dash(b.x0 - 84, b.y0 - 84, b.x0 - 84, b.y1 + 84);
    dash(b.x1 + 84, b.y0 - 84, b.x1 + 84, b.y1 + 84);
    add(street.build(), material(pics.asphalt, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    add(walk.build(), material(pics.sidewalk));
    add(yellow.build(), material(pics.line, { color: L.centerLine, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { order: 1 });

    // Lots along each side, facing in.
    const sides: { ox: number; oy: number; ax: number; ay: number; len: number; outX: number; outY: number }[] = [
      { ox: b.x0, oy: b.y0, ax: 1, ay: 0, len: b.x1 - b.x0, outX: 0, outY: -1 },
      { ox: b.x1, oy: b.y1, ax: -1, ay: 0, len: b.x1 - b.x0, outX: 0, outY: 1 },
      { ox: b.x0, oy: b.y1, ax: 0, ay: -1, len: b.y1 - b.y0, outX: -1, outY: 0 },
      { ox: b.x1, oy: b.y0, ax: 0, ay: 1, len: b.y1 - b.y0, outX: 1, outY: 0 },
    ];
    const drive = new Flat(TILE.sidewalk);
    const carColors = ["#c8463f", "#3d6ff0", "#e9e6df", "#2b3040", "#7fb069", "#d9a441", "#8b5cf6", "#9aa1ad"];
    for (const sd of sides) {
      const town = new Mesher();
      const extrasMesh = new Mesher();
      towns.push(town);
      extraSides.push(extrasMesh);
      let along = 60;
      while (along < sd.len - 60) {
        const W = 62 + rnd() * 26;
        const lotW = W + 70;
        if (along + lotW > sd.len - 40) break;
        const mid = along + lotW / 2;
        // Lot frame: origin at the lot's front middle (180 out), x along the street, z outward.
        const ox = sd.ox + sd.ax * mid + sd.outX * 180;
        const oy = sd.oy + sd.ay * mid + sd.outY * 180;
        // The lot's frame: local +z points outward (the house's front faces -z, toward the track).
        const rot = Math.atan2(sd.outX, sd.outY);
        const ca = Math.cos(rot), sa = Math.sin(rot);
        const toWorld = (lx: number, lz: number): [number, number] => [ox + lx * ca + lz * sa, oy - lx * sa + lz * ca];
        const garageLeft = rnd() < 0.5;
        const g = house(town, rnd, ox, oy, rot, W, garageLeft);
        // Driveway from the garage door to the street, and a path to the front door.
        const dx0 = g.garageX - 18, dx1 = g.garageX + 18;
        const dp = [toWorld(dx0, -60), toWorld(dx1, -60), toWorld(dx1, 0), toWorld(dx0, 0)];
        drive.quad([dp[0][0], 0.5, dp[0][1]], [dp[1][0], 0.5, dp[1][1]], [dp[2][0], 0.5, dp[2][1]], [dp[3][0], 0.5, dp[3][1]]);
        const pp = [toWorld(g.doorX - 4, -38), toWorld(g.doorX + 4, -38), toWorld(g.doorX + 4, -2), toWorld(g.doorX - 4, -2)];
        drive.quad([pp[0][0], 0.45, pp[0][1]], [pp[1][0], 0.45, pp[1][1]], [pp[2][0], 0.45, pp[2][1]], [pp[3][0], 0.45, pp[3][1]]);
        // A white picket fence along the front, with gaps for the path and the driveway.
        const fz = -36;
        const gaps = [[g.doorX - 7, g.doorX + 7], [dx0 - 3, dx1 + 3]].sort((p, q) => p[0] - q[0]);
        const runs: [number, number][] = [];
        let from = -lotW / 2 + 4;
        for (const [g0, g1] of gaps) {
          if (g0 > from) runs.push([from, g0]);
          from = Math.max(from, g1);
        }
        if (lotW / 2 - 4 > from) runs.push([from, lotW / 2 - 4]);
        for (const [a0, a1] of runs) {
          if (a1 - a0 < 6) continue;
          for (let lx = a0 + 1; lx <= a1 - 1; lx += 6) {
            const [px, pz] = toWorld(lx, fz);
            extrasMesh.box(1.8, 9, 1, L.fence, at(px, 0, pz, rot));
          }
          const [m0, m1] = toWorld((a0 + a1) / 2, fz + 0.9);
          for (const y of [3, 6.4]) extrasMesh.box(a1 - a0, 1.1, 0.6, L.fence, at(m0, y, m1, rot));
        }
        // A mailbox at the curb.
        const [mx, mz] = toWorld(dx1 + 9, -46);
        extrasMesh.box(1.8, 16, 1.8, L.trunk, at(mx, 0, mz, rot));
        mailbox(extrasMesh, mx, mz, rot - Math.PI / 2, L.homes.doors[Math.floor(rnd() * L.homes.doors.length)], "#e5533c", 16);
        // Bushes and flowers along the house front.
        for (let k = 0; k < 3; k++) {
          const lx = g.doorX + (k - 1) * 20 + (rnd() - 0.5) * 6;
          if (lx > dx0 - 6 && lx < dx1 + 6) continue;
          const [bx, bz] = toWorld(lx, -8);
          bushSpots.push({ x: bx, y: bz, s: 0.55 + rnd() * 0.2, tone: 2 });
        }
        // Trees in the back yard.
        for (let k = rnd() < 0.5 ? 0 : 1; k < 2; k++) {
          const [tx2, tz] = toWorld((rnd() - 0.5) * lotW * 0.8, 110 + rnd() * 70);
          treeSpots.push({ x: tx2, y: tz, s: 0.9 + rnd() * 0.5, tone: Math.floor(rnd() * 4) });
        }
        // Now and then a car on the driveway or at the curb.
        const roll = rnd();
        if (roll < 0.42) {
          const color = carColors[Math.floor(rnd() * carColors.length)];
          const onDrive = roll < 0.3;
          const [cx3, cz] = onDrive ? toWorld(g.garageX, -24) : toWorld(along - mid + 40 + rnd() * (lotW - 80), -70);
          const facingAng = onDrive ? rot - Math.PI / 2 : rot + (rnd() < 0.5 ? 0 : Math.PI);
          extrasMesh.add(parkedCar(color), null, at(cx3, 0, cz, facingAng), true);
        }
        along += lotW + 8 + rnd() * 30;
      }
    }
    add(drive.build(), material(pics.sidewalk));
  }
  const townMat = paintMaterial();
  for (const t of towns) if (!t.empty) add(t.build(), townMat, { cast: true });
  for (const t of extraSides) if (!t.empty) add(t.build(), townMat, { cast: true, extra: true });

  // Trees all round, far out: a ring that fades into the haze.
  const farStart = treeSpots.length;
  for (let k = 0; k < 120; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = 1500 + rnd() * 900;
    const x = cx + Math.cos(a) * rr * 1.05;
    const y = cy + Math.sin(a) * rr;
    if (x > b.x0 - 340 && x < b.x1 + 340 && y > b.y0 - 340 && y < b.y1 + 340) continue;
    treeSpots.push({ x, y, s: 1.2 + rnd() * 0.8, tone: Math.floor(rnd() * 4) });
  }
  // Clumps of trees at the four corners outside.
  for (const [qx, qy] of [[b.x0 - 120, b.y0 - 120], [b.x1 + 120, b.y0 - 120], [b.x0 - 120, b.y1 + 120], [b.x1 + 120, b.y1 + 120]]) {
    for (let k = 0; k < 4; k++) treeSpots.splice(farStart, 0, { x: qx + (rnd() - 0.5) * 120 + Math.sign(qx - cx) * 90, y: qy + (rnd() - 0.5) * 120 + Math.sign(qy - cy) * 90, s: 1 + rnd() * 0.4, tone: k % 4 });
  }

  // ── Trees, bushes and flowers: instanced ──
  {
    const leaf = new Mesher();
    leaf.add(new THREE.DodecahedronGeometry(24, 0), "#d0d0d0", at(0, 58, 0, 0, 1, 0.9, 1));
    leaf.blob(17, "#ffffff", at(-6, 76, 4, 0.5, 1, 0.9, 1), 0);
    leaf.blob(15, "#bdbdbd", at(9, 50, -6, 1, 1, 0.9, 1), 0);
    const trunk = new Mesher();
    trunk.cyl(3, 4.5, 50, 6, "#ffffff", at(0, 0, 0));
    const leafGeo = leaf.build();
    const trunkGeo = trunk.build();
    // Near trees (in and round the track) cast shadows; the far ring doesn't.
    for (const [from, to, cast] of [[0, farStart, true], [farStart, treeSpots.length, false]] as const) {
      const spots = treeSpots.slice(from, to);
      if (!spots.length) continue;
      const leaves = new THREE.InstancedMesh(leafGeo, paintMaterial(), spots.length);
      const trunks = new THREE.InstancedMesh(trunkGeo, paintMaterial(), spots.length);
      spots.forEach((t, i) => {
        const m = at(t.x, t.lift ?? 0, t.y, rnd() * 6, t.s, t.s * (0.9 + rnd() * 0.25), t.s);
        leaves.setMatrixAt(i, m);
        trunks.setMatrixAt(i, m);
        leaves.setColorAt(i, tint(L.leaves[t.tone % L.leaves.length], 0.95 + rnd() * 0.12));
        trunks.setColorAt(i, tint(L.trunk));
      });
      for (const mesh of [leaves, trunks]) {
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        if (!cast) extras.push(mesh);
        disposables.push(mesh.material as THREE.Material);
      }
    }
    disposables.push(leafGeo, trunkGeo);

    const bush = new Mesher();
    bush.add(new THREE.DodecahedronGeometry(13, 0), "#ffffff", at(0, 9, 0, 0, 1, 0.8, 1));
    bush.blob(10, "#d6d6d6", at(-9, 7, 4, 0.6, 1, 0.75, 1), 0);
    bush.blob(10, "#e4e4e4", at(8, 7, -3, 1.2, 1, 0.75, 1), 0);
    const bushGeo = bush.build();
    const bushes = new THREE.InstancedMesh(bushGeo, paintMaterial(), bushSpots.length);
    bushSpots.forEach((t, i) => {
      bushes.setMatrixAt(i, at(t.x, 0, t.y, rnd() * 6, t.s * 1.5, t.s * 1.5, t.s * 1.5));
      bushes.setColorAt(i, tint(L.leaves[(t.tone + i) % L.leaves.length], 1.05));
    });
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    bushes.computeBoundingSphere();
    group.add(bushes);
    const solidBushes = track.props.filter((p) => p.kind === "bush").length;
    thinned.push([bushes, bushSpots.length, solidBushes]);
    disposables.push(bushGeo, bushes.material as THREE.Material);

    // Flowers: a bloom in its color over a green leaf (two instanced meshes, same placements).
    // A flower: a flat six-petal head over a low tuft of leaves.
    const bloomGeo = new Mesher().cyl(1.9, 1.3, 0.9, 6, "#ffffff", at(0, 3.2, 0, 0.4)).build();
    const leafGeo2 = new Mesher().add(new THREE.OctahedronGeometry(2.4, 0), "#ffffff", at(0, 1.1, 0, 0, 1, 0.55, 1)).build();
    const blooms = new THREE.InstancedMesh(bloomGeo, paintMaterial(), flowers.length);
    const greens = new THREE.InstancedMesh(leafGeo2, paintMaterial(), flowers.length);
    flowers.forEach((f, i) => {
      const m = at(f.x, 1.4, f.y, rnd() * 6, 0.9 + rnd() * 0.4);
      blooms.setMatrixAt(i, m);
      greens.setMatrixAt(i, m);
      blooms.setColorAt(i, tint(f.c));
      greens.setColorAt(i, tint(L.leaves[1]));
    });
    for (const fl of [blooms, greens]) {
      fl.computeBoundingSphere();
      group.add(fl);
      disposables.push(fl.geometry, fl.material as THREE.Material);
    }
  }

  // ── Clouds, far off, never fogged ──
  {
    const m = new Mesher();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
      const r = 3600 + rnd() * 600;
      const x = cx + Math.cos(a) * r;
      const z = cy + Math.sin(a) * r;
      const y = 520 + rnd() * 420;
      const s = 0.8 + rnd() * 0.7;
      for (let p = 0; p < 5; p++) m.blob(70 * s * (0.7 + rnd() * 0.5), "#ffffff", at(x + (p - 2) * 70 * s, y + rnd() * 20, z + (rnd() - 0.5) * 50, rnd() * 3, 1.3, 0.55, 1), 0);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: new THREE.Color("#c9d8ea") });
    add(m.build(), mat, { receive: false });
  }

  return {
    group,
    extras,
    thinned,
    sprinklers,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** A mailbox: a rounded box on top of a post at height `y`, facing `ang`. */
function mailbox(m: Mesher, x: number, z: number, ang: number, color: string, flag: string, y: number): void {
  m.box(8, 4.5, 4.6, color, at(x, y, z, ang));
  const roof = new THREE.CylinderGeometry(2.3, 2.3, 8, 10, 1, false, 0, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.rotateX(Math.PI / 2);
  m.add(roof, color, at(x, y + 4.5, z, ang));
  m.box(0.6, 4, 1.4, flag, at(x + Math.sin(ang) * 2.6, y + 3.5, z + Math.cos(ang) * 2.6, ang));
}

/** A lemonade stand (inside its collider), facing `ang`. */
function lemonadeStand(m: Mesher, x: number, z: number, ang: number): void {
  const c = PROP_LOOK.stand.colors;
  const place = (lx: number, ly: number, lz: number) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return [x + lx * ca + lz * sa, ly, z - lx * sa + lz * ca] as const;
  };
  const box = (w: number, h: number, d: number, color: string, lx: number, ly: number, lz: number) => {
    const [px, py, pz] = place(lx, ly, lz);
    m.box(w, h, d, color, at(px, py, pz, ang));
  };
  // Counter, its front panel, posts, the striped awning, a pitcher and cups.
  box(12, 12, 26, c[2], 0, 0, 0);
  box(1, 9, 24, c[0], 6.2, 1.5, 0);
  for (const lz of [-12, 12]) for (const lx of [-5, 5]) box(1.4, 26, 1.4, c[2], lx, 0, lz);
  for (let k = 0; k < 6; k++) {
    const lz = -12.5 + k * 5 + 2.5;
    const [px, py, pz] = place(0.6, 26, lz);
    m.box(15, 1.2, 5, k % 2 ? c[1] : c[0], atR(px, py, pz, 0, ang, 0.22));
  }
  box(3.4, 5, 3.4, c[3], 1, 12, -6);
  for (const lz of [2, 6]) box(1.8, 2.6, 1.8, "#ffffff", 2, 12, lz);
}

/**
 * A house facing the street at `rot` (local -z faces the street), with a
 * gable roof, windows, a front door with a step, and a garage on one side.
 * Returns where its door and garage are along the lot (local x).
 */
function house(m: Mesher, rnd: () => number, ox: number, oy: number, rot: number, W: number, garageLeft: boolean): { doorX: number; garageX: number } {
  const L = TRACK_LOOK.homes;
  const wall = L.walls[Math.floor(rnd() * L.walls.length)];
  const roof = L.roofs[Math.floor(rnd() * L.roofs.length)];
  const door = L.doors[Math.floor(rnd() * L.doors.length)];
  const D = 58 + rnd() * 18;
  const two = rnd() < 0.4;
  const H = two ? 52 : 32 + rnd() * 6;
  const G = 44;
  const gx = garageLeft ? -W / 2 + G / 2 - 30 : W / 2 - G / 2 + 30;
  const hx = garageLeft ? 18 : -18;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const P = (lx: number, ly: number, lz: number, turn = 0, sx = 1, sy = 1, sz = 1) => at(ox + lx * ca + lz * sa, ly, oy - lx * sa + lz * ca, rot + turn, sx, sy, sz);
  // The house: walls, roof (gable along the street), a chimney now and then.
  m.box(W, H, D, wall, P(hx, 0, D / 2));
  m.box(W + 2, 2, D + 2, L.trim, P(hx, 0, D / 2));
  const R = 22 + rnd() * 8;
  m.prism([[-D / 2 - 5, 0], [D / 2 + 5, 0], [0, R]], W + 8, roof, P(hx, H, D / 2, Math.PI / 2));
  if (rnd() < 0.5) m.box(7, R + 6, 7, mix(roof, "#ffffff", 0.2).getStyle(), P(hx + W * 0.25, H, D * 0.6));
  // Windows: glass in white frames, one or two rows.
  const rows = two ? [10, 32] : [11];
  const doorX = hx + (garageLeft ? -W * 0.22 : W * 0.22);
  for (const y of rows) {
    for (const k of [-0.36, 0, 0.36]) {
      const wx = hx + W * k;
      if (y < 20 && Math.abs(wx - doorX) < 12) continue;
      m.box(13, 12, 1, L.trim, P(wx, y, -0.4));
      m.box(10.5, 9.5, 1, L.glass, P(wx, y + 1.25, -0.9));
    }
  }
  // Front door, a step and a little porch roof.
  m.box(11, 21, 1, L.trim, P(doorX, 0, -0.4));
  m.box(8.5, 18.5, 1, door, P(doorX, 0, -0.9));
  m.box(18, 2, 8, L.trim, P(doorX, 0, -4));
  m.box(20, 1.4, 9, roof, P(doorX, 23, -4));
  // The garage: a lower box with its own roof and a panel door.
  m.box(G, 28, 52, wall, P(gx, 0, 26));
  m.prism([[-G / 2 - 3, 0], [G / 2 + 3, 0], [0, 12]], 54, roof, P(gx, 28, 26));
  m.box(36, 22, 1, L.garage, P(gx, 0, -0.5));
  for (const y of [5.5, 11, 16.5]) m.box(36, 0.6, 1, mix(L.garage, "#000000", 0.18).getStyle(), P(gx, y, -1));
  return { doorX, garageX: gx };
}
