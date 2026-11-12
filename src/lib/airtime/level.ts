/**
 * Airtime's levels (pure, client-safe): the City rooftops course, built from
 * hand-made chunks by a seeded generator. Same seed and level number, same level.
 *
 * Coordinates: x runs forward (right on screen), y up. A roof is a solid block
 * from far below the street up to its top; you run on its top and its sides are
 * walls. Scaffold planks are one-way (fly up through them, land on top). The
 * crane's arm is solid (a low ceiling over the gap) and its swinging load hurts.
 * Antenna masts are thin solid poles to fly over.
 *
 * Every way from one surface to the next is listed as a Crossing with a lane: a
 * height to fly at that clears it. The tests fly every crossing of 500 seeds with
 * the real physics, starting half a second before the edge, to prove each one
 * can be cleared; the autopilot flies the same lanes.
 */

import type { EnemyKind } from "./content";
import { levelSeed, seeded } from "./rng";
import { levelSpeed, TUNING } from "./tuning";

export type SolidKind = "roof" | "mast" | "arm";

export interface Solid {
  kind: SolidKind;
  x0: number;
  x1: number;
  /** Bottom and top. */
  y0: number;
  y1: number;
  /** 0..1, picks the building's look (colors, windows). */
  look: number;
}

/** A one-way plank (scaffolding): you land on its top and fly up through it. */
export interface Ledge {
  x0: number;
  x1: number;
  y: number;
}

/** A crane's swinging load: hangs `len` below its pivot and swings `amp` radians each way. */
export interface Load {
  px: number;
  py: number;
  len: number;
  amp: number;
  /** Ticks for one full swing. */
  period: number;
  phase: number;
  w: number;
  h: number;
}

export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
  /** A walker's patrol (its center stays between these). */
  x0: number;
  x1: number;
}

export type PickupKind = "spread" | "rapid" | "heart" | "star";

export interface PickupSpawn {
  kind: PickupKind;
  x: number;
  y: number;
}

/** Things that are only drawn (they never touch you). */
export type DecorKind = "vent" | "ac" | "tank" | "hut" | "dish" | "skylight" | "chimney" | "plants" | "crane" | "scaffold" | "gate";

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 for small variations. */
  v: number;
}

export type CrossingKind = "gap" | "step" | "scaffold" | "crane" | "mast" | "drop";

export interface Crossing {
  kind: CrossingKind;
  /** Where you leave the surface you're on. */
  fromX: number;
  /** Where the next surface starts (for a mast: where it ends). */
  toX: number;
  fromTop: number;
  toTop: number;
  /** A height (for your feet) that clears it. */
  lane: number;
}

export interface Level {
  seed: number;
  number: number;
  speed: number;
  /** The finish gate: cross it and the level is cleared. */
  gateX: number;
  /** Where the last roof ends. */
  endX: number;
  start: { x: number; y: number };
  /** Sorted by x0. */
  solids: Solid[];
  maxSolidW: number;
  ledges: Ledge[];
  loads: Load[];
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
  decor: Decor[];
  crossings: Crossing[];
}

/** Roof heights the course uses. */
export const TOPS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
/** Roofs reach this far down (well below the screen). */
export const ROOF_BOTTOM = -40;
/** Feet this far above the higher side clears a gap. */
const LANE_UP = 1.4;
const MAST_W = 0.35;

type ChunkId = "gap" | "step" | "scaffold" | "crane" | "turret" | "flyers" | "drop" | "runway";

class Builder {
  solids: Solid[] = [];
  ledges: Ledge[] = [];
  loads: Load[] = [];
  enemies: EnemySpawn[] = [];
  pickups: PickupSpawn[] = [];
  decor: Decor[] = [];
  crossings: Crossing[] = [];
  /** The end of the roof you're on, and its top. */
  x = 0;
  h = 2.5;
  /** Pickups waiting for a good spot (placed on the next crossing's line). */
  pending: PickupKind[] = [];

  constructor(public r: () => number) {}

  range(a: number, b: number): number {
    return a + (b - a) * this.r();
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.r() * list.length))];
  }

  /** A roof top `dmin`..`dmax` steps from the current one (one step = 1 meter). */
  top(dmin: number, dmax: number): number {
    const options = TOPS.filter((t) => t - this.h >= dmin - 1e-9 && t - this.h <= dmax + 1e-9);
    return options.length ? this.pick(options) : this.h;
  }

  roof(x0: number, x1: number, top: number, decorate = true): Solid {
    const s: Solid = { kind: "roof", x0, x1, y0: ROOF_BOTTOM, y1: top, look: this.r() };
    this.solids.push(s);
    this.x = x1;
    this.h = top;
    if (decorate) this.decorate(s);
    return s;
  }

  crossing(kind: CrossingKind, fromX: number, toX: number, fromTop: number, toTop: number, lane = Math.max(fromTop, toTop) + LANE_UP): Crossing {
    const c: Crossing = { kind, fromX, toX, fromTop, toTop, lane };
    this.crossings.push(c);
    // A waiting pickup goes on this crossing's line, over the gap (or just past the wall).
    if (this.pending.length && toX - fromX > 1.5) {
      const kind = this.pending.shift()!;
      const y = kind === "heart" ? lane + 2.2 : lane + 0.7;
      this.pickups.push({ kind, x: (fromX + toX) / 2, y });
    }
    return c;
  }

  /** Rooftop clutter behind the running line: vents, AC units, a water tank, a stair hut. */
  decorate(s: Solid): void {
    const len = s.x1 - s.x0;
    const used: [number, number][] = [];
    const place = (kind: Decor["kind"], w: number, h: number) => {
      for (let tries = 0; tries < 6; tries++) {
        const x = this.range(s.x0 + w / 2 + 0.4, s.x1 - w / 2 - 0.4);
        if (used.every(([a, b]) => x + w / 2 < a - 0.4 || x - w / 2 > b + 0.4)) {
          used.push([x - w / 2, x + w / 2]);
          this.decor.push({ kind, x, y: s.y1, w, h, v: this.r() });
          return;
        }
      }
    };
    if (len >= 9 && this.r() < 0.45) place("tank", 2.4, 4.2);
    if (len >= 8 && this.r() < 0.3) place("hut", 2.6, 2.3);
    if (this.r() < 0.6) place("ac", 1.5, 1.0);
    if (len >= 12 && this.r() < 0.4) place("ac", 1.5, 1.0);
    const vents = Math.floor(len / 7 + this.r() * 1.5);
    for (let i = 0; i < vents; i++) place("vent", 0.5, 0.9);
    if (this.r() < 0.2) place("dish", 1.2, 1.3);
    if (this.r() < 0.3) place("skylight", 2, 0.5);
    if (this.r() < 0.2) place("chimney", 0.8, 1.6);
    if (len >= 10 && this.r() < 0.18) place("plants", 2.2, 0.8);
  }

  walker(x0: number, x1: number, y: number): void {
    const half = TUNING.walker.w / 2;
    if (x1 - x0 < 2) return;
    this.enemies.push({ kind: "walker", x: (x0 + x1) / 2, y, x0: x0 + half, x1: x1 - half });
  }

  turret(x: number, y: number): void {
    this.enemies.push({ kind: "turret", x, y, x0: x, x1: x });
  }

  flyer(x: number, y: number): void {
    this.enemies.push({ kind: "flyer", x, y, x0: x, x1: x });
  }

  stars(points: [number, number][]): void {
    for (const [x, y] of points) this.pickups.push({ kind: "star", x, y });
  }

  /** A row of stars along an arc from (x0, y0) to (x1, y1), lifted `lift` in the middle. */
  arc(n: number, x0: number, y0: number, x1: number, y1: number, lift: number): void {
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + lift * 4 * t * (1 - t)]);
    }
    this.stars(pts);
  }

  /** Masts on a roof (each one a crossing to fly over). Returns how many. */
  masts(s: Solid, dd: number): number {
    const len = s.x1 - s.x0;
    if (len < 16) return 0;
    // Far enough in that you can land after a gap and still climb, and well clear of the far edge.
    let x = s.x0 + this.range(7, 9);
    let n = 0;
    while (x + MAST_W < s.x1 - 7 && n < 2) {
      const mh = this.range(2.2, 3.2) + dd * 0.5;
      const m: Solid = { kind: "mast", x0: x, x1: x + MAST_W, y0: s.y1, y1: s.y1 + mh, look: this.r() };
      this.solids.push(m);
      this.crossings.push({ kind: "mast", fromX: m.x0, toX: m.x1, fromTop: s.y1, toTop: s.y1, lane: m.y1 + 0.45 });
      n++;
      // Sometimes a star line over the top.
      if (this.r() < 0.5) this.arc(3, m.x0 - 1.4, m.y1 + 1.1, m.x1 + 1.4, m.y1 + 1.1, 0.5);
      if (this.r() < 0.5) break;
      x += this.range(4.5, 6.5);
    }
    return n;
  }
}

/** How hard this part of the level is (0..1): grows with the level number and along the level. */
function hardness(level: number, progress: number): number {
  return Math.min(1, 0.1 + Math.min(1, (level - 1) / 6) * 0.55 + progress * 0.35);
}

function chunk(b: Builder, id: ChunkId, dd: number): void {
  const A = b.x;
  const hA = b.h;
  switch (id) {
    case "gap": {
      const g = b.range(2.2, 3.6) + dd * b.range(0.5, 2.6);
      const top = b.top(-2, 2);
      const x0 = A + g;
      const s = b.roof(x0, x0 + b.range(9, 18), top);
      const c = b.crossing("gap", A, x0, hA, top);
      if (b.r() < 0.3) b.arc(4, A + 0.4, c.lane + 0.5, x0 - 0.4, c.lane + 0.5, 1.2);
      if (b.masts(s, dd) === 0 && b.r() < 0.25 + dd * 0.4) b.walker(s.x0 + 3, s.x1 - 1, top);
      return;
    }
    case "step": {
      const up = b.r() < 0.6;
      const top = up ? b.top(1, 2) : b.top(-2, -1);
      const s = b.roof(A, A + b.range(8, 13), top);
      b.crossing("step", A, A, hA, top);
      if (b.r() < 0.2 + dd * 0.3) b.walker(s.x0 + 3, s.x1 - 1, top);
      return;
    }
    case "runway": {
      const g = b.r() < 0.5 ? 0 : b.range(2, 3);
      const top = g === 0 ? b.top(-1, 1) : b.top(-1, 1);
      const x0 = A + g;
      const s = b.roof(x0, x0 + b.range(14, 20), top);
      if (g === 0 && top !== hA) b.crossing("step", A, A, hA, top);
      else if (g > 0) b.crossing("gap", A, x0, hA, top);
      b.arc(5, s.x0 + 4, top + 0.8, s.x0 + 9, top + 0.8, 0);
      if (b.r() < 0.35 + dd * 0.3) b.walker(s.x0 + 10, s.x1 - 1, top);
      return;
    }
    case "drop": {
      const g = b.range(3.5, 5.5) + dd * 1.2;
      const top = b.top(-3, -2);
      const x0 = A + g;
      b.roof(x0, x0 + b.range(10, 14), top);
      const c = b.crossing("drop", A, x0, hA, top);
      const n = 1 + (b.r() < dd ? 1 : 0);
      for (let i = 0; i < n; i++) b.flyer(x0 + 3 + i * 3.4, c.lane + b.range(1.2, 3.2));
      return;
    }
    case "flyers": {
      const g = b.range(6, 8.5);
      const top = b.top(-1, 1);
      const x0 = A + g;
      b.roof(x0, x0 + b.range(9, 13), top);
      const c = b.crossing("gap", A, x0, hA, top);
      const n = 2 + (b.r() < 0.3 + dd * 0.5 ? 1 : 0);
      const base = c.lane + b.range(0.2, 1.6);
      for (let i = 0; i < n; i++) b.flyer(x0 + 2 + i * 3.2, base + (i % 2 ? 1.4 : 0));
      return;
    }
    case "turret": {
      const g = b.range(2.4, 3.8);
      const top = b.top(0, 2);
      const x0 = A + g;
      const s = b.roof(x0, x0 + b.range(11, 15), top);
      b.crossing("gap", A, x0, hA, top);
      b.turret(s.x1 - b.range(2, 3.2), top);
      if (dd > 0.55 && b.r() < 0.5) b.walker(s.x0 + 3, s.x1 - 5, top);
      return;
    }
    case "scaffold": {
      const G = b.range(9, 12);
      const top = b.top(0, 2);
      const B = A + G;
      // A low plank (a dip under the line, with stars) and a high one.
      const lowY = Math.max(0.5, hA - b.pick([0.5, 1]));
      const l1x0 = A + b.range(1, 1.8);
      const l1x1 = l1x0 + b.range(3.4, 4.4);
      const hiY = Math.max(hA, top) + 1.5;
      const l2x0 = l1x1 + b.range(1.2, 1.8);
      const l2x1 = B - b.range(1, 1.6);
      b.ledges.push({ x0: l1x0, x1: l1x1, y: lowY });
      if (l2x1 - l2x0 >= 2.5) b.ledges.push({ x0: l2x0, x1: l2x1, y: hiY });
      b.decor.push({ kind: "scaffold", x: A + 0.2, y: lowY, w: G - 0.4, h: hiY - lowY, v: b.r() });
      b.stars([
        [l1x0 + 0.8, lowY + 0.9],
        [(l1x0 + l1x1) / 2, lowY + 0.9],
        [l1x1 - 0.8, lowY + 0.9],
      ]);
      if (l2x1 - l2x0 >= 4 && b.r() < 0.35 + dd * 0.4) b.walker(l2x0, l2x1, hiY);
      b.roof(B, B + b.range(9, 13), top);
      b.crossing("scaffold", A, B, hA, top, Math.max(hA, top, hiY) + LANE_UP);
      return;
    }
    case "crane": {
      const G = b.range(10.5, 12.5);
      // Low enough that the arm leaves room to fly over the load.
      const top = b.top(0, hA >= 4.5 ? 0 : 1);
      const h = Math.max(hA, top);
      const armBottom = Math.min(h + 7.6, 12.2);
      const B = A + G;
      const s = b.roof(B, B + b.range(11, 14), top, false);
      b.solids.push({ kind: "arm", x0: A - 1.5, x1: B + 7, y0: armBottom, y1: armBottom + 0.6, look: b.r() });
      const rest = h + 2.9;
      const period = Math.round(170 - dd * 30);
      b.loads.push({ px: A + G / 2, py: armBottom, len: armBottom - rest, amp: 0.5 + dd * 0.1, period, phase: Math.floor(b.r() * period), w: 1.7, h: 1.3 });
      // The tower stands on the far roof, behind the running line; it reaches the arm.
      b.decor.push({ kind: "crane", x: s.x0 + 3, y: top, w: 1.3, h: armBottom + 0.6 - top, v: b.r() });
      // The low road under the load pays.
      b.stars([
        [A + G * 0.3, h + 0.9],
        [A + G * 0.5, h + 0.9],
        [A + G * 0.7, h + 0.9],
      ]);
      b.crossing("crane", A, B, hA, top, h + 4.6);
      return;
    }
  }
}

const WEIGHTS: Record<ChunkId, (dd: number, h: number) => number> = {
  gap: () => 3,
  step: () => 1.4,
  runway: () => 0.8,
  drop: (_dd, h) => (h >= 2.5 ? 1 : 0),
  flyers: (dd) => 0.6 + dd,
  turret: (dd) => 0.6 + dd * 1.2,
  scaffold: () => 1.1,
  crane: (_dd, h) => (h <= 4.5 ? 0.9 : 0),
};

/** Builds level `level` (1-based) of a run from its seed. */
export function buildLevel(seed: number, level: number): Level {
  const r = seeded(levelSeed(seed, level));
  const b = new Builder(r);
  const speed = levelSpeed(level);
  const length = Math.round(speed * TUNING.levelSeconds);

  // The runway: a long first roof, no enemies, a welcome row of stars.
  b.roof(-14, 26, 2.5);
  b.arc(4, 11, 3.4, 15.5, 3.4, 0);

  // Weapons turn up about a quarter and two thirds of the way; a heart now and then.
  const weapons: PickupKind[] = r() < 0.5 ? ["spread", "rapid"] : ["rapid", "spread"];
  const plan: [number, PickupKind][] = [
    [0.22, weapons[0]],
    [0.62, weapons[1]],
  ];
  if (r() < 0.3 + (level >= 3 ? 0.15 : 0)) plan.push([0.45, "heart"]);
  plan.sort((a, c) => a[0] - c[0]);

  let last: ChunkId | null = null;
  let cranes = 0;
  while (b.x < length - 28) {
    const p = b.x / length;
    while (plan.length && plan[0][0] <= p) b.pending.push(plan.shift()![1]);
    const dd = hardness(level, p);
    const ids = (Object.keys(WEIGHTS) as ChunkId[]).filter((id) => {
      if (id === last && id !== "gap") return false;
      if (id === "crane" && cranes >= 2) return false;
      if ((id === "scaffold" || id === "crane") && p < 0.1) return false;
      return true;
    });
    let total = 0;
    const w = ids.map((id) => {
      const v = WEIGHTS[id](dd, b.h);
      total += v;
      return v;
    });
    let roll = r() * total;
    let id = ids[ids.length - 1];
    for (let i = 0; i < ids.length; i++) {
      roll -= w[i];
      if (roll < 0) {
        id = ids[i];
        break;
      }
    }
    if (id === "crane") cranes++;
    chunk(b, id, dd);
    last = id;
  }
  while (b.pending.length) b.pending.shift();

  // The finish: one more gap, then a long roof with the gate on it.
  const A = b.x;
  const hA = b.h;
  const x0 = A + b.range(2.4, 3.4);
  const top = b.top(-1, 1);
  const end = b.roof(x0, x0 + 44, top);
  b.crossing("gap", A, x0, hA, top);
  const gateX = x0 + 10;
  b.decor.push({ kind: "gate", x: gateX, y: top, w: 1, h: 6.4, v: 0 });
  // Keep the gate clear of clutter.
  b.decor = b.decor.filter((d) => d.kind === "gate" || d.x + d.w / 2 < gateX - 2 || d.x - d.w / 2 > gateX + 2 || d.y !== top);

  const solids = b.solids.sort((a, c) => a.x0 - c.x0);
  return {
    seed,
    number: level,
    speed,
    gateX,
    endX: end.x1,
    start: { x: 2, y: 2.5 },
    solids,
    maxSolidW: solids.reduce((m, s) => Math.max(m, s.x1 - s.x0), 0),
    ledges: b.ledges,
    loads: b.loads,
    enemies: b.enemies,
    pickups: b.pickups,
    decor: b.decor,
    crossings: b.crossings,
  };
}

/** The same level with only its ground and hazards (no enemies or pickups): what the gap tests fly. */
export function bareLevel(level: Level): Level {
  return { ...level, enemies: [], pickups: [] };
}

/** Solids that overlap [xa, xb] (uses the x0 order). */
export function solidsNear(level: Level, xa: number, xb: number, out: Solid[]): Solid[] {
  out.length = 0;
  const list = level.solids;
  // First solid starting after xb.
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].x0 <= xb) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0; i--) {
    const s = list[i];
    if (s.x0 < xa - level.maxSolidW) break;
    if (s.x1 >= xa) out.push(s);
  }
  return out;
}

/** The top of whatever is under x (the highest roof or plank), or null over a gap. */
export function groundUnder(level: Level, x: number): number | null {
  let best: number | null = null;
  for (const s of level.solids) {
    if (s.kind !== "roof" || x < s.x0 || x > s.x1) continue;
    if (best === null || s.y1 > best) best = s.y1;
  }
  for (const l of level.ledges) if (x >= l.x0 && x <= l.x1 && (best === null || l.y > best)) best = l.y;
  return best;
}
