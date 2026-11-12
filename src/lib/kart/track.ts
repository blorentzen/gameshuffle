/**
 * Shuffle Kart tracks (pure, client-safe): a track is a closed loop of control
 * points smoothed into a centerline, sampled every SPACING units. Everything
 * the race needs is worked out once here: half widths, tangents, the checkpoint
 * gates, the start, the solid props, the slippery patch and the ramp. The
 * tracks themselves (shape, props, colors, names) live in content.ts.
 *
 * World coordinates are the top-down picture's: x right, y down, so a heading
 * of 0 faces east and a positive turn is clockwise on the map (a right turn).
 */

export const SPACING = 12;

export interface PropDef {
  /** A PropKind from content.ts (how it's drawn lives there). */
  kind: string;
  x: number;
  y: number;
  /** Collider radius; 0 = scenery you can't touch. */
  r: number;
  /** Sprite height in world units. */
  h: number;
}

/** A flat patch painted on the ground (a tile tone name). */
export interface MatDef { x: number; y: number; w: number; h: number; angle: number; tone: string }

export interface TrackPoint { x: number; y: number; /** Half width here (default: the track's). */ w?: number }

export interface TrackDef {
  id: string;
  name: string;
  /** The world is a square this many units across (also the ground picture's size in pixels). */
  world: number;
  /** The boundary's inner faces: the walls around the world. */
  table: { x0: number; y0: number; x1: number; y1: number };
  points: TrackPoint[];
  halfWidth: number;
  /** Checkpoint gates around the loop (gate 0 is the finish line). */
  gates: number;
  /** How far a gate reaches past the track's edge, so going wide still counts. */
  gateMargin: number;
  /** The start grid sits this far behind the finish line. */
  startBack: number;
  props: PropDef[];
  /** The slippery patch: a puddle made of circles. */
  slick: { x: number; y: number; r: number }[];
  /** The ramp: it starts at the track point nearest `near` and runs along the track. */
  ramp: { near: [number, number]; length: number; halfWidth: number; height: number };
  mats: MatDef[];
  coasters: { x: number; y: number; r: number }[];
  laps: number;
  /**
   * Item Box rows for races with items (the time trial ignores them): `at` is how
   * far round the loop (0..1 from the finish line), `lanes` the boxes across it as
   * shares of the half width (negative = left).
   */
  boxes?: { at: number; lanes: number[] }[];
}

export interface Gate { index: number; x1: number; y1: number; x2: number; y2: number; tx: number; ty: number }

export interface Ramp {
  /** Low end's middle. */
  x: number;
  y: number;
  /** Unit vector up the ramp, and its right-hand normal. */
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  length: number;
  halfWidth: number;
  height: number;
}

export interface Track {
  def: TrackDef;
  mirror: boolean;
  /** Bests and ghosts are kept per key (the track, mirrored or not). */
  key: string;
  n: number;
  xs: Float64Array;
  ys: Float64Array;
  hw: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  length: number;
  gates: Gate[];
  props: PropDef[];
  solids: { x: number; y: number; r: number }[];
  slick: { x: number; y: number; r: number }[];
  ramp: Ramp;
  mats: MatDef[];
  coasters: { x: number; y: number; r: number }[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  start: { x: number; y: number; h: number };
}

export function trackKey(id: string, mirror: boolean): string {
  return mirror ? `${id}-mirror` : id;
}

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

/** Centripetal Catmull-Rom through a closed loop, densely sampled. */
function denseLoop(pts: { x: number; y: number; w: number }[]): { x: number; y: number; w: number }[] {
  const m = pts.length;
  const out: { x: number; y: number; w: number }[] = [];
  const PER = 48;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    const t0 = 0;
    const t1 = t0 + Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), 0.5);
    const t2 = t1 + Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), 0.5);
    const t3 = t2 + Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), 0.5);
    for (let k = 0; k < PER; k++) {
      const u = k / PER;
      const t = t1 + (t2 - t1) * u;
      const a1x = ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x;
      const a1y = ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y;
      const a2x = ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x;
      const a2y = ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y;
      const a3x = ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x;
      const a3y = ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y;
      const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x;
      const b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
      const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
      const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;
      const cx = ((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x;
      const cy = ((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y;
      out.push({ x: cx, y: cy, w: p1.w + (p2.w - p1.w) * smooth(u) });
    }
  }
  return out;
}

/** Builds a track from its definition (mirrored left to right for the Mirror twist). */
export function buildTrack(def: TrackDef, mirror = false): Track {
  const W = def.world;
  const mx = (x: number) => (mirror ? W - x : x);
  const pts = def.points.map((p) => ({ x: mx(p.x), y: p.y, w: p.w ?? def.halfWidth }));
  const dense = denseLoop(pts);

  // Resample evenly by distance.
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[dense.length];
  const n = Math.max(16, Math.round(total / SPACING));
  const step = total / n;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const hw = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (j < dense.length - 1 && cum[j + 1] < target) j++;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    const span = cum[j + 1] - cum[j] || 1;
    const u = (target - cum[j]) / span;
    xs[i] = a.x + (b.x - a.x) * u;
    ys[i] = a.y + (b.y - a.y) * u;
    hw[i] = a.w + (b.w - a.w) * u;
  }
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const nx = xs[(i + 1) % n] - xs[(i - 1 + n) % n];
    const ny = ys[(i + 1) % n] - ys[(i - 1 + n) % n];
    const len = Math.hypot(nx, ny) || 1;
    tx[i] = nx / len;
    ty[i] = ny / len;
  }

  const gates: Gate[] = [];
  for (let k = 0; k < def.gates; k++) {
    const i = Math.round((k * n) / def.gates) % n;
    const reach = hw[i] + def.gateMargin;
    // Right-hand normal of the tangent: (-ty, tx).
    gates.push({
      index: k,
      x1: xs[i] + ty[i] * reach,
      y1: ys[i] - tx[i] * reach,
      x2: xs[i] - ty[i] * reach,
      y2: ys[i] + tx[i] * reach,
      tx: tx[i],
      ty: ty[i],
    });
  }

  const props = def.props.map((p) => ({ ...p, x: mx(p.x) }));
  const solids = props.filter((p) => p.r > 0).map((p) => ({ x: p.x, y: p.y, r: p.r }));

  const rampAt = nearestIndex(xs, ys, mx(def.ramp.near[0]), def.ramp.near[1]);
  const ramp: Ramp = {
    x: xs[rampAt],
    y: ys[rampAt],
    dx: tx[rampAt],
    dy: ty[rampAt],
    nx: -ty[rampAt],
    ny: tx[rampAt],
    length: def.ramp.length,
    halfWidth: def.ramp.halfWidth,
    height: def.ramp.height,
  };

  const startIdx = (n - Math.round(def.startBack / step) + n) % n;
  const table = def.table;
  const bounds = mirror
    ? { x0: W - table.x1, y0: table.y0, x1: W - table.x0, y1: table.y1 }
    : { ...table };

  return {
    def,
    mirror,
    key: trackKey(def.id, mirror),
    n,
    xs,
    ys,
    hw,
    tx,
    ty,
    length: total,
    gates,
    props,
    solids,
    slick: def.slick.map((c) => ({ ...c, x: mx(c.x) })),
    ramp,
    mats: def.mats.map((m) => ({ ...m, x: mx(m.x), angle: mirror ? -m.angle : m.angle })),
    coasters: def.coasters.map((c) => ({ ...c, x: mx(c.x) })),
    bounds,
    start: { x: xs[startIdx], y: ys[startIdx], h: Math.atan2(ty[startIdx], tx[startIdx]) },
  };
}

function nearestIndex(xs: Float64Array, ys: Float64Array, x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export interface Nearest {
  /** Segment from point i to point i+1. */
  i: number;
  /** How far along that segment, 0..1. */
  t: number;
  /** Distance from the centerline. */
  dist: number;
  /** Half width at that spot. */
  hw: number;
  /** Distance along the loop from the finish line. */
  s: number;
}

/**
 * A lookup grid for nearest(): for each square cell, the only segments that can
 * be closest to any point inside it (every other segment is provably farther, by
 * the triangle inequality, with half a unit to spare). Scanning just those, in
 * the same order and with the same arithmetic, gives exactly the answer the full
 * scan gives, about 25 times faster, which matters once eight karts race.
 * Built once per centerline (keyed by its array, so copies of a track share it).
 */
interface NearGrid { x0: number; y0: number; cs: number; cols: number; rows: number; start: Int32Array; list: Int32Array }
const NEAR_GRIDS = new WeakMap<Float64Array, NearGrid>();
const GRID_CELL = 32;
const GRID_PAD = 420;

function segDist(xs: Float64Array, ys: Float64Array, n: number, i: number, x: number, y: number): number {
  const ax = xs[i];
  const ay = ys[i];
  const k = i + 1 === n ? 0 : i + 1;
  const ex = xs[k] - ax;
  const ey = ys[k] - ay;
  const len2 = ex * ex + ey * ey || 1;
  let t = ((x - ax) * ex + (y - ay) * ey) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(ax + ex * t - x, ay + ey * t - y);
}

function nearGrid(track: Track): NearGrid {
  const hit = NEAR_GRIDS.get(track.xs);
  if (hit) return hit;
  const { xs, ys, n } = track;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const cs = GRID_CELL;
  const x0 = Math.floor((minX - GRID_PAD) / cs) * cs;
  const y0 = Math.floor((minY - GRID_PAD) / cs) * cs;
  const cols = Math.ceil((maxX + GRID_PAD - x0) / cs);
  const rows = Math.ceil((maxY + GRID_PAD - y0) / cs);
  const half = (cs * Math.SQRT2) / 2;
  const start = new Int32Array(cols * rows + 1);
  const out: number[] = [];
  const d = new Float64Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (c + 0.5) * cs;
      const cy = y0 + (r + 0.5) * cs;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        d[i] = segDist(xs, ys, n, i, cx, cy);
        if (d[i] < best) best = d[i];
      }
      const limit = best + 2 * half + 0.5;
      start[r * cols + c] = out.length;
      for (let i = 0; i < n; i++) if (d[i] <= limit) out.push(i);
    }
  }
  start[cols * rows] = out.length;
  const grid = { x0, y0, cs, cols, rows, start, list: Int32Array.from(out) };
  NEAR_GRIDS.set(track.xs, grid);
  return grid;
}

/** The closest spot on the centerline (never jumps to the wrong part of the loop: the grid only skips segments that can't be closest). */
export function nearest(track: Track, x: number, y: number): Nearest {
  const { xs, ys, n } = track;
  let bi = 0;
  let bt = 0;
  let bd = Infinity;
  const g = nearGrid(track);
  const col = Math.floor((x - g.x0) / g.cs);
  const row = Math.floor((y - g.y0) / g.cs);
  if (col >= 0 && col < g.cols && row >= 0 && row < g.rows) {
    const cell = row * g.cols + col;
    const list = g.list;
    for (let q = g.start[cell], end = g.start[cell + 1]; q < end; q++) {
      const i = list[q];
      const ax = xs[i];
      const ay = ys[i];
      const k = i + 1 === n ? 0 : i + 1;
      const ex = xs[k] - ax;
      const ey = ys[k] - ay;
      const len2 = ex * ex + ey * ey || 1;
      let t = ((x - ax) * ex + (y - ay) * ey) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = ax + ex * t - x;
      const py = ay + ey * t - y;
      const d = px * px + py * py;
      if (d < bd) {
        bd = d;
        bi = i;
        bt = t;
      }
    }
    return nearestResult(track, bi, bt, bd);
  }
  // Outside the grid (never in a race): the full scan.
  for (let i = 0; i < n; i++) {
    const ax = xs[i];
    const ay = ys[i];
    const k = i + 1 === n ? 0 : i + 1;
    const ex = xs[k] - ax;
    const ey = ys[k] - ay;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((x - ax) * ex + (y - ay) * ey) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + ex * t - x;
    const py = ay + ey * t - y;
    const d = px * px + py * py;
    if (d < bd) {
      bd = d;
      bi = i;
      bt = t;
    }
  }
  return nearestResult(track, bi, bt, bd);
}

/**
 * The closest spot on the centerline within `span` points either side of a known
 * spot (`hint`, a point index). Racers in a race keep their own spot this way,
 * so a kart near another part of the loop (the infield bends sit close
 * together) is never read as being over there. Falls back to nearest() if the
 * kart is far from anywhere near the hint.
 */
export function nearestFrom(track: Track, x: number, y: number, hint: number, span = 40): Nearest {
  const { xs, ys, n } = track;
  let bi = -1;
  let bt = 0;
  let bd = Infinity;
  const h = ((Math.floor(hint) % n) + n) % n;
  for (let q = -span; q <= span; q++) {
    const i = (h + q + n) % n;
    const ax = xs[i];
    const ay = ys[i];
    const k = i + 1 === n ? 0 : i + 1;
    const ex = xs[k] - ax;
    const ey = ys[k] - ay;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((x - ax) * ex + (y - ay) * ey) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + ex * t - x;
    const py = ay + ey * t - y;
    const d = px * px + py * py;
    if (d < bd) {
      bd = d;
      bi = i;
      bt = t;
    }
  }
  const out = nearestResult(track, bi, bt, bd);
  return out.dist > out.hw + 220 ? nearest(track, x, y) : out;
}

function nearestResult(track: Track, bi: number, bt: number, bd: number): Nearest {
  const k = bi + 1 === track.n ? 0 : bi + 1;
  const hw = track.hw[bi] + (track.hw[k] - track.hw[bi]) * bt;
  return { i: bi, t: bt, dist: Math.sqrt(bd), hw, s: ((bi + bt) / track.n) * track.length };
}

export type Surface = "road" | "grass" | "slick";

export function inSlick(track: Track, x: number, y: number): boolean {
  for (const c of track.slick) {
    if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) return true;
  }
  return false;
}

/** Height of the ground (the ramp; everywhere else is flat at 0). */
export function groundAt(track: Track, x: number, y: number): number {
  const r = track.ramp;
  const ax = x - r.x;
  const ay = y - r.y;
  const along = ax * r.dx + ay * r.dy;
  if (along < 0 || along > r.length) return 0;
  const across = ax * r.nx + ay * r.ny;
  if (Math.abs(across) > r.halfWidth) return 0;
  return (r.height * along) / r.length;
}

/** The track direction at a spot, as an angle. */
export function tangentAngle(track: Track, near: Nearest): number {
  const k = near.i + 1 === track.n ? 0 : near.i + 1;
  const x = track.tx[near.i] + (track.tx[k] - track.tx[near.i]) * near.t;
  const y = track.ty[near.i] + (track.ty[k] - track.ty[near.i]) * near.t;
  return Math.atan2(y, x);
}
