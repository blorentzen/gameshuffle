/**
 * A race against the cast (pure, client-safe): you plus seven computer racers,
 * Item Boxes, the nine items, odds by place, bumps, and each cast member's
 * stats and quirk. The time trial (race.ts on its own) is untouched: this file
 * wraps a normal Race and steps it with the same physics.
 *
 * Everything is a function of the roll's seed and your inputs: the computer
 * racers, the boxes and every random number live in the race's own data (no
 * clock, no Math.random), so a server can replay a race from the seed and the
 * input log and get the same result to the bit.
 *
 * Each step, in order:
 *   1. inputs (yours, and the computer racers' from the state at the start of the step)
 *   2. timers tick down; spin-outs that end hand out Al's and Cam's boosts; a
 *      racer well past a lap gate they skipped is put back before it
 *   3. starts (the perfect-start window at GO) and item uses
 *   4. physics for every kart (race.ts's stepRacer: walls, laps, recording)
 *   5. bumps between karts (pushes on velocity, so a lap gate is never skipped)
 *   6. projectiles, Oil Slicks and Item Boxes
 *   7. where everyone is and the places
 */

import { autopilot } from "./autopilot";
import { aiDrive, newBrain, profileFor, type Brain, type Profile } from "./ai";
import { FIRST_TRACK, TRACKS, type BodyId, type RacerStats, type WheelId } from "./content";
import { dealField, fieldSeed, FIELD_SIZE, startBoostFor, type Contender } from "./field";
import { decodeInputs, encodeInputs } from "./ghost";
import {
  ITEM_IDS,
  itemOdds,
  ITEM_TUNING,
  ITEM_VALUE,
  pickItem,
  ticks,
  type HitKind,
  type ItemId,
} from "./items";
import { NO_INPUT, startState, TUNING, type KartInput, type KartState, type KartStats } from "./physics";
import { quirkOf, wanderAt, type Quirk } from "./quirks";
import { createRace, packInput, poseFlags, quantize, raceStep, stepRacer, unpackInput, type Race, type RaceEvents } from "./race";
import { draw, mixSeed } from "./rng";
import type { Roll } from "./roll";
import type { DriverId } from "./roster";
import { buildTrack, nearest, nearestFrom, type Nearest, type Track } from "./track";

export type Difficulty = "easy" | "normal" | "hard";

/** Your input for a race with items: driving plus the item button (uses an item when pressed). */
export interface GpInput extends KartInput {
  item?: boolean;
}

export const NO_GP_INPUT: GpInput = { ...NO_INPUT, item: false };

export interface GrandPrixOpts {
  roll: Roll;
  /** Defaults to the roll's track, mirrored for the Mirror twist. */
  track?: Track;
  laps?: number;
  difficulty?: Difficulty;
  /** Seconds the race runs on after you finish; then the rest are placed by where they are (default 30). */
  runOn?: number;
  /** Racers in the field (default 8). */
  size?: number;
}

/** The perfect-start window: gas pressed this many steps before GO, up to this many after. Max's is twice as wide. */
export const START_WINDOW = { before: 9, after: 6 };

/** Kart bumps: bounce, how hard overlapping karts are pushed apart, and the push that breaks a drift. */
export const BUMP_TUNING = { bounce: 0.35, push: 8, breakDrift: 70, event: 25 };

/** Catch-up for computer racers far behind the leader (never for you): mild, and only past this gap. */
export const CATCH_UP = { from: 650, per: 1 / 25000, max: 0.03 };

/**
 * Missed checkpoint: anyone this far past a lap gate they skipped (cutting the
 * infield, or knocked wide of it) is put back on the road just before it. The
 * time trial keeps its own rule (the lap waits until you go back).
 */
export const MISSED_GATE = { past: 300, back: 40 };

/** A race that runs this long is called (5 minutes). */
export const MAX_RACE_TICKS = 60 * 300;

export interface Rider {
  id: string;
  driver: DriverId;
  name: string;
  body: BodyId;
  wheels: WheelId;
  human: boolean;
  /** Grid slot, 0 = pole. */
  grid: number;
  stats: RacerStats;
  /** The kart for this race; `eff` is it with this step's effects (race.racers[i].stats points at eff). */
  base: KartStats;
  eff: KartStats;
  quirk: Quirk;
  /** The item in the slot (still spinning in the roulette while `roll` > 0). */
  item: ItemId | null;
  roll: number;
  /** Steps left: a raised Shield, a spin-out (and its full length), no-hit time, a Shockwave slow, smoke. */
  bubble: number;
  spin: number;
  spinFor: number;
  invuln: number;
  slow: number;
  smoke: number;
  /** Boost seconds due when the spin-out ends (Al's anger, Cam's chat). */
  pending: number;
  chatUsed: boolean;
  itemDown: boolean;
  gasDown: boolean;
  /** The step gas was pressed (held since), for the start. */
  gasFrom: number | null;
  start: "perfect" | "early" | "late" | null;
  /** Where they are (end of the last step): along the lap, across the road (right +), total progress, place. */
  s: number;
  lat: number;
  prog: number;
  place: number;
  /** Their spot on the centerline (kept step to step, see nearestFrom). */
  near: Nearest;
  /** The Oil Slick they're sitting on (so Gary's shrug is announced once). */
  onSlick: number;
  /** Computer racers (and nothing for you). */
  brain: Brain | null;
  profile: Profile | null;
}

export interface Box {
  id: number;
  row: number;
  x: number;
  y: number;
  s: number;
  lat: number;
  /** Steps until it's back (0 = there). */
  back: number;
}

export type ShotKind = "homing-missile" | "heat-seeker" | "dart-blaster";

export interface Shot {
  id: number;
  kind: ShotKind;
  owner: number;
  x: number;
  y: number;
  /** Height above the ground (for drawing). */
  z: number;
  h: number;
  vx: number;
  vy: number;
  /** Progress along the race (missile and Heat Seeker) and across the road. */
  prog: number;
  lat: number;
  /** Who it's after (-1 = nobody). */
  target: number;
  /** A racer it can no longer hit (Pip after a near miss). */
  skip: number;
  age: number;
  bounces: number;
}

export interface Slick {
  id: number;
  x: number;
  y: number;
  /** Where it lies on the road: along the loop and across it. */
  s: number;
  lat: number;
  r: number;
  owner: number;
  age: number;
}

export type GpEvent =
  | { type: "start"; racer: number; result: "perfect" | "early" | "late" }
  | { type: "box"; racer: number; item: ItemId | null; place: number }
  | { type: "ready"; racer: number; item: ItemId }
  | { type: "use"; racer: number; item: ItemId; target: number }
  | { type: "hit"; racer: number; by: number; kind: HitKind }
  | { type: "block"; racer: number; by: number; kind: HitKind }
  | { type: "dodge"; racer: number; by: number }
  | { type: "slow"; racer: number; by: number }
  | { type: "smoke"; racer: number; by: number }
  | { type: "slick-proof"; racer: number }
  | { type: "boost"; racer: number; why: "start" | "angry" | "chat" | "coffee" | "energy-drink" }
  | { type: "bump"; racer: number; other: number; force: number }
  | { type: "clean"; shot: number; slick: number }
  | { type: "shot-gone"; shot: number; kind: ShotKind }
  | { type: "tow"; racer: number; missed: boolean }
  | { type: "over" };

export interface GpStepEvents extends RaceEvents {
  events: GpEvent[];
}

export interface GrandPrix {
  v: 1;
  seed: number;
  difficulty: Difficulty;
  runOn: number;
  race: Race;
  riders: Rider[];
  boxes: Box[];
  shots: Shot[];
  slicks: Slick[];
  /** The race's random numbers (boxes, near misses). */
  rng: number;
  nextId: number;
  /** Steps before a Shockwave can come out of a box again. */
  shockWait: number;
  /** Racer indexes by place. */
  order: number[];
  /** The step the race ends (once you finish), and whether it's over. */
  endAt: number | null;
  over: boolean;
  /** Your inputs, one packed number per step from the first countdown step (packGpInput). */
  log: number[];
}

// ─────────────────────────── Geometry worked out once per track ───────────────────────────

export interface TrackGeo {
  L: number;
  /** Where each lap gate sits along the loop. */
  gateS: number[];
  /** How much the road turns over the next 300 units, at each centerline point (radians). */
  bend: Float64Array;
  /** Which way and how much it turns over the next 240 units (radians, right = positive). */
  turn: Float64Array;
}

const GEO = new WeakMap<Float64Array, TrackGeo>();

export function trackGeo(track: Track): TrackGeo {
  const hit = GEO.get(track.xs);
  if (hit) return hit;
  const { n, length: L } = track;
  const K = track.gates.length;
  const gateS: number[] = [];
  for (let k = 0; k < K; k++) gateS.push(((Math.round((k * n) / K) % n) / n) * L);
  const bend = new Float64Array(n);
  const steps = Math.max(1, Math.round(300 / (L / n)));
  for (let i = 0; i < n; i++) {
    let turn = 0;
    for (let j = 0; j < steps; j++) {
      const a = (i + j) % n;
      const b = (a + 1) % n;
      turn += Math.abs(wrapAngle(Math.atan2(track.ty[b], track.tx[b]) - Math.atan2(track.ty[a], track.tx[a])));
    }
    bend[i] = turn;
  }
  const turn = new Float64Array(n);
  const steps2 = Math.max(1, Math.round(240 / (L / n)));
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < steps2; j++) {
      const a = (i + j) % n;
      const b = (a + 1) % n;
      t += wrapAngle(Math.atan2(track.ty[b], track.tx[b]) - Math.atan2(track.ty[a], track.tx[a]));
    }
    turn[i] = t;
  }
  const geo = { L, gateS, bend, turn };
  GEO.set(track.xs, geo);
  return geo;
}

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function wrapHalf(d: number, L: number): number {
  let x = d % L;
  if (x >= L / 2) x -= L;
  else if (x < -L / 2) x += L;
  return x;
}

/** A point on the road: `s` along the loop and `lat` units right of the centerline. */
export function roadPoint(track: Track, s: number, lat: number): { x: number; y: number; h: number } {
  const L = track.length;
  const n = track.n;
  const f = ((((s % L) + L) % L) / L) * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const u = f - Math.floor(f);
  const tx = track.tx[i0] + (track.tx[i1] - track.tx[i0]) * u;
  const ty = track.ty[i0] + (track.ty[i1] - track.ty[i0]) * u;
  const len = Math.hypot(tx, ty) || 1;
  const cx = track.xs[i0] + (track.xs[i1] - track.xs[i0]) * u;
  const cy = track.ys[i0] + (track.ys[i1] - track.ys[i0]) * u;
  return { x: cx + (-ty / len) * lat, y: cy + (tx / len) * lat, h: Math.atan2(ty, tx) };
}

/** Half width of the road at a spot along the loop. */
export function halfWidthAt(track: Track, s: number): number {
  const n = track.n;
  const i = Math.floor(((((s % track.length) + track.length) % track.length) / track.length) * n) % n;
  return track.hw[i];
}

/** How much the road turns over the next 300 units from a spot along the loop. */
export function bendAhead(track: Track, s: number): number {
  const geo = trackGeo(track);
  const n = track.n;
  const i = Math.floor(((((s % geo.L) + geo.L) % geo.L) / geo.L) * n) % n;
  return geo.bend[i];
}

/** Which way and how much the road turns over the next 240 units from a spot along the loop (right = positive). */
export function turnAhead(track: Track, s: number): number {
  const geo = trackGeo(track);
  const n = track.n;
  const i = Math.floor(((((s % geo.L) + geo.L) % geo.L) / geo.L) * n) % n;
  return geo.turn[i];
}

/** Where a racer is: along the lap, across the road, and total progress (laps included). */
function locate(gp: GrandPrix, i: number): void {
  const race = gp.race;
  const track = race.track;
  const geo = trackGeo(track);
  const r = race.racers[i];
  const k = r.kart;
  const rd = gp.riders[i];
  const near = rd.near.i < 0 ? nearest(track, k.x, k.y) : nearestFrom(track, k.x, k.y, rd.near.i);
  rd.near = near;
  const j = near.i + 1 === track.n ? 0 : near.i + 1;
  const tx = track.tx[near.i] + (track.tx[j] - track.tx[near.i]) * near.t;
  const ty = track.ty[near.i] + (track.ty[j] - track.ty[near.i]) * near.t;
  const len = Math.hypot(tx, ty) || 1;
  const cx = track.xs[near.i] + (track.xs[j] - track.xs[near.i]) * near.t;
  const cy = track.ys[near.i] + (track.ys[j] - track.ys[near.i]) * near.t;
  rd.s = near.s;
  rd.lat = (k.x - cx) * (-ty / len) + (k.y - cy) * (tx / len);
  const K = race.track.gates.length;
  if (r.passed <= 0) rd.prog = wrapHalf(near.s, geo.L);
  else {
    const last = (r.passed - 1) % K;
    const laps = Math.floor((r.passed - 1) / K);
    rd.prog = laps * geo.L + geo.gateS[last] + wrapHalf(near.s - geo.gateS[last], geo.L);
  }
}

/** Places: finished racers by finish time, then everyone else by progress. */
function rank(gp: GrandPrix): void {
  const rs = gp.race.racers;
  const order = rs.map((_, i) => i);
  order.sort((a, b) => {
    const fa = rs[a].finishAt;
    const fb = rs[b].finishAt;
    if (fa !== null && fb !== null) return fa - fb || a - b;
    if (fa !== null) return -1;
    if (fb !== null) return 1;
    return gp.riders[b].prog - gp.riders[a].prog || a - b;
  });
  gp.order = order;
  order.forEach((idx, p) => (gp.riders[idx].place = p + 1));
}

/** The racer one place ahead who's still racing (-1 if none). */
export function aheadOf(gp: GrandPrix, i: number): number {
  const p = gp.riders[i].place;
  if (p <= 1) return -1;
  const j = gp.order[p - 2];
  return gp.race.racers[j].finishAt === null ? j : -1;
}

/** The racer one place behind who's still racing (-1 if none). */
export function behindOf(gp: GrandPrix, i: number): number {
  const p = gp.riders[i].place;
  if (p >= gp.order.length) return -1;
  const j = gp.order[p];
  return gp.race.racers[j].finishAt === null ? j : -1;
}

/** The leader still racing, not counting `skip` (-1 if none). */
export function leaderOf(gp: GrandPrix, skip = -1): number {
  for (const j of gp.order) if (j !== skip && gp.race.racers[j].finishAt === null) return j;
  return -1;
}

// ─────────────────────────── Inputs ───────────────────────────

export function quantizeGp(inp: GpInput): GpInput {
  return { ...quantize(inp), item: !!inp.item };
}

/** One step's input as a number: the race's packed driving input with the item button in the lowest bit. */
export function packGpInput(inp: GpInput): number {
  return packInput(quantize(inp)) * 2 + (inp.item ? 1 : 0);
}

export function unpackGpInput(v: number): GpInput {
  return { ...unpackInput(Math.floor(v / 2)), item: (v & 1) === 1 };
}

/** The input log, run-length packed (the same format as a ghost's inputs). */
export function encodeGpLog(log: number[]): string {
  return encodeInputs(log);
}

export function decodeGpLog(s: string): number[] {
  return decodeInputs(s);
}

const SPIN_INPUT: KartInput = { steer: 0, gas: false, brake: false, drift: false, assist: false };

// ─────────────────────────── Setting up ───────────────────────────

function roadOf(roll: Roll): Track {
  return buildTrack(TRACKS[roll.track] ?? FIRST_TRACK, roll.twist === "mirror");
}

function makeRider(c: Contender, i: number, seed: number, difficulty: Difficulty): Rider {
  const profile = c.human ? null : profileFor(c.driver, c.stats, difficulty);
  return {
    id: c.id,
    driver: c.driver,
    name: c.name,
    body: c.body,
    wheels: c.wheels,
    human: c.human,
    grid: c.grid,
    stats: c.stats,
    base: { ...c.kart },
    eff: { ...c.kart },
    quirk: quirkOf(c.driver),
    item: null,
    roll: 0,
    bubble: 0,
    spin: 0,
    spinFor: 0,
    invuln: 0,
    slow: 0,
    smoke: 0,
    pending: 0,
    chatUsed: false,
    itemDown: false,
    gasDown: false,
    gasFrom: null,
    start: null,
    s: 0,
    lat: 0,
    prog: 0,
    place: i + 1,
    near: { i: -1, t: 0, dist: 0, hw: 0, s: 0 },
    onSlick: -1,
    brain: profile ? newBrain(mixSeed(seed, i + 1), profile) : null,
    profile,
  };
}

/** Sets up a race against the cast from a roll. Racer 0 is you; the countdown starts at the first gpStep. */
export function createGrandPrix(opts: GrandPrixOpts): GrandPrix {
  const roll = opts.roll;
  const track = opts.track ?? roadOf(roll);
  const difficulty = opts.difficulty ?? "normal";
  const field = dealField(roll, opts.size ?? FIELD_SIZE);
  const race = createRace(track, field.map((c) => ({ id: c.id, stats: c.kart })), opts.laps ?? track.def.laps);
  const seed = (fieldSeed(roll) ^ 0x2545f491) >>> 0;
  const riders = field.map((c, i) => makeRider(c, i, seed, difficulty));
  race.racers.forEach((r, i) => {
    const k = startState(track, field[i].grid, field.length);
    r.kart = k;
    r.poses = [k.x, k.y, k.z, k.h, poseFlags(k)];
    r.stats = riders[i].eff;
  });
  const boxes: Box[] = [];
  let id = 1;
  (track.def.boxes ?? []).forEach((row, ri) => {
    const s = row.at * track.length;
    const hw = halfWidthAt(track, s);
    for (const lane of row.lanes) {
      const lat = lane * hw;
      const p = roadPoint(track, s, lat);
      boxes.push({ id: id++, row: ri, x: p.x, y: p.y, s, lat, back: 0 });
    }
  });
  const gp: GrandPrix = {
    v: 1,
    seed,
    difficulty,
    runOn: opts.runOn ?? 30,
    race,
    riders,
    boxes,
    shots: [],
    slicks: [],
    rng: seed,
    nextId: id,
    shockWait: 0,
    order: riders.map((_, i) => i),
    endAt: null,
    over: false,
    log: [],
  };
  for (let i = 0; i < riders.length; i++) locate(gp, i);
  rank(gp);
  return gp;
}

// ─────────────────────────── Effects ───────────────────────────

function boostKart(k: KartState, seconds: number, kick: number): void {
  k.boost = Math.max(k.boost, seconds);
  k.vx += Math.cos(k.h) * kick;
  k.vy += Math.sin(k.h) * kick;
}

function hitRadius(rd: Rider): number {
  return TUNING.kartRadius * (rd.quirk.hitScale ?? 1);
}

function canBeHit(gp: GrandPrix, j: number): boolean {
  const r = gp.race.racers[j];
  return r.finishAt === null && r.kart.z < 12;
}

/**
 * Something hits racer v. A raised Shield, or one still in the slot, takes it
 * instead (a Heat Seeker still jolts the leader). Returns what happened, so a
 * projectile knows it's used up and an Oil Slick knows it's been driven through.
 */
function hitRacer(gp: GrandPrix, ev: GpEvent[], v: number, kind: HitKind, by: number): "hit" | "blocked" | "immune" {
  const rd = gp.riders[v];
  const k = gp.race.racers[v].kart;
  if (gp.race.racers[v].finishAt !== null || rd.invuln > 0) return "immune";
  if (rd.bubble > 0 || (rd.item === "shield" && rd.roll === 0)) {
    if (rd.bubble > 0) rd.bubble = 0;
    else rd.item = null;
    if (kind === "heat") {
      k.vx *= ITEM_TUNING.staggerKeep;
      k.vy *= ITEM_TUNING.staggerKeep;
      k.drift = 0;
      k.charge = 0;
      k.tier = 0;
      k.boost = 0;
    }
    rd.invuln = ticks(0.5);
    ev.push({ type: "block", racer: v, by, kind });
    return "blocked";
  }
  const h = ITEM_TUNING.hits[kind];
  const spin = ticks(h.spin * (rd.quirk.spinMul ?? 1));
  k.vx *= h.keep;
  k.vy *= h.keep;
  k.drift = 0;
  k.charge = 0;
  k.tier = 0;
  k.boost = 0;
  rd.spin = spin;
  rd.spinFor = spin;
  rd.invuln = spin + ticks(ITEM_TUNING.invulnerable);
  rd.pending = 0;
  if (rd.quirk.angryBoost) rd.pending += rd.quirk.angryBoost;
  if (rd.quirk.hitBoost && !rd.chatUsed) {
    rd.chatUsed = true;
    rd.pending += rd.quirk.hitBoost;
  }
  ev.push({ type: "hit", racer: v, by, kind });
  return "hit";
}

function heldBy(gp: GrandPrix, item: ItemId): boolean {
  return gp.riders.some((r) => r.item === item);
}

/** What an Item Box deals racer i right now (their place, Felix's extra deal, the rare-item limits). Uses the race's random numbers. */
export function dealItem(gp: GrandPrix, i: number): ItemId {
  const rd = gp.riders[i];
  const blocked: ItemId[] = [];
  if (gp.shots.some((s) => s.kind === "heat-seeker") || heldBy(gp, "heat-seeker")) blocked.push("heat-seeker");
  if (gp.shockWait > 0 || heldBy(gp, "shockwave")) blocked.push("shockwave");
  const odds = itemOdds(rd.place, gp.riders.length, 0, blocked);
  let best = pickItem(odds, draw(gp));
  // Felix: more than one deal, and he keeps the strongest.
  for (let extra = (rd.quirk.boxRolls ?? 1) - 1; extra > 0; extra--) {
    const again = pickItem(odds, draw(gp));
    if (ITEM_VALUE[again] > ITEM_VALUE[best]) best = again;
  }
  return best;
}

function spendItem(gp: GrandPrix, ev: GpEvent[], i: number): void {
  const rd = gp.riders[i];
  const k = gp.race.racers[i].kart;
  const item = rd.item;
  if (!item) return;
  rd.item = null;
  const C = ITEM_TUNING;
  let target = -1;
  switch (item) {
    case "coffee":
      boostKart(k, C.coffee.boost, C.coffee.kick);
      ev.push({ type: "boost", racer: i, why: "coffee" });
      break;
    case "energy-drink":
      boostKart(k, C.energyDrink.boost, C.energyDrink.kick);
      ev.push({ type: "boost", racer: i, why: "energy-drink" });
      break;
    case "shield":
      rd.bubble = ticks(C.shield.bubble);
      break;
    case "oil-slick": {
      const track = gp.race.track;
      const x = k.x - Math.cos(k.h) * C.oilSlick.behind;
      const y = k.y - Math.sin(k.h) * C.oilSlick.behind;
      const at = nearestFrom(track, x, y, rd.near.i < 0 ? 0 : rd.near.i);
      const j = at.i + 1 === track.n ? 0 : at.i + 1;
      const cx = track.xs[at.i] + (track.xs[j] - track.xs[at.i]) * at.t;
      const cy = track.ys[at.i] + (track.ys[j] - track.ys[at.i]) * at.t;
      const lat = (x - cx) * -track.ty[at.i] + (y - cy) * track.tx[at.i];
      gp.slicks.push({ id: gp.nextId++, x, y, s: at.s, lat, r: C.oilSlick.radius, owner: i, age: 0 });
      while (gp.slicks.length > C.oilSlick.max) gp.slicks.shift();
      break;
    }
    case "homing-missile": {
      target = aheadOf(gp, i);
      const p = roadPoint(gp.race.track, rd.s + 16, rd.lat);
      gp.shots.push({ id: gp.nextId++, kind: item, owner: i, x: p.x, y: p.y, z: 6, h: p.h, vx: 0, vy: 0, prog: rd.prog + 16, lat: rd.lat, target, skip: -1, age: 0, bounces: 0 });
      break;
    }
    case "heat-seeker": {
      target = leaderOf(gp, i);
      const p = roadPoint(gp.race.track, rd.s + 16, rd.lat);
      gp.shots.push({ id: gp.nextId++, kind: item, owner: i, x: p.x, y: p.y, z: 30, h: p.h, vx: 0, vy: 0, prog: rd.prog + 16, lat: rd.lat, target, skip: -1, age: 0, bounces: 0 });
      break;
    }
    case "dart-blaster": {
      const fx = Math.cos(k.h);
      const fy = Math.sin(k.h);
      const sp = C.dartBlaster.speed;
      gp.shots.push({ id: gp.nextId++, kind: item, owner: i, x: k.x + fx * 14, y: k.y + fy * 14, z: 5, h: k.h, vx: fx * sp, vy: fy * sp, prog: rd.prog, lat: rd.lat, target: -1, skip: -1, age: 0, bounces: 0 });
      break;
    }
    case "shockwave": {
      gp.shockWait = ticks(C.shockwave.cooldown);
      for (let j = 0; j < gp.riders.length; j++) {
        if (j === i || gp.riders[j].place >= rd.place || gp.race.racers[j].finishAt !== null) continue;
        const o = gp.riders[j];
        const ok = gp.race.racers[j].kart;
        o.slow = ticks(C.shockwave.slow);
        ok.vx *= C.shockwave.keep;
        ok.vy *= C.shockwave.keep;
        ok.drift = 0;
        ok.charge = 0;
        ok.tier = 0;
        ok.boost = 0;
        ev.push({ type: "slow", racer: j, by: i });
      }
      break;
    }
    case "smoke-bomb": {
      target = aheadOf(gp, i);
      if (target >= 0) {
        gp.riders[target].smoke = ticks(C.smokeBomb.time);
        ev.push({ type: "smoke", racer: target, by: i });
      }
      break;
    }
  }
  ev.push({ type: "use", racer: i, item, target });
}

// ─────────────────────────── Bumps ───────────────────────────

function bumps(gp: GrandPrix, ev: GpEvent[]): void {
  const B = BUMP_TUNING;
  const rs = gp.race.racers;
  const R = TUNING.kartRadius * 2;
  for (let a = 0; a < rs.length; a++) {
    if (rs[a].finishAt !== null) continue;
    const ka = rs[a].kart;
    for (let b = a + 1; b < rs.length; b++) {
      if (rs[b].finishAt !== null) continue;
      const kb = rs[b].kart;
      if (Math.abs(ka.z - kb.z) > 10) continue;
      const dx = kb.x - ka.x;
      const dy = kb.y - ka.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : Math.cos(ka.h + Math.PI / 2);
      const ny = d > 1e-6 ? dy / d : Math.sin(ka.h + Math.PI / 2);
      const ia = 1 / gp.riders[a].eff.mass;
      const ib = 1 / gp.riders[b].eff.mass;
      const vrel = (kb.vx - ka.vx) * nx + (kb.vy - ka.vy) * ny;
      const j = vrel < 0 ? (-(1 + B.bounce) * vrel) / (ia + ib) : 0;
      const push = (R - d) * B.push;
      const pa = j * ia + (push * ia) / (ia + ib);
      const pb = j * ib + (push * ib) / (ia + ib);
      ka.vx -= nx * pa;
      ka.vy -= ny * pa;
      kb.vx += nx * pb;
      kb.vy += ny * pb;
      ka.speed = ka.vx * Math.cos(ka.h) + ka.vy * Math.sin(ka.h);
      kb.speed = kb.vx * Math.cos(kb.h) + kb.vy * Math.sin(kb.h);
      if (j * ia > B.breakDrift && ka.drift) {
        ka.drift = 0;
        ka.charge = 0;
        ka.tier = 0;
      }
      if (j * ib > B.breakDrift && kb.drift) {
        kb.drift = 0;
        kb.charge = 0;
        kb.tier = 0;
      }
      if (j > B.event) ev.push({ type: "bump", racer: a, other: b, force: Math.round(j) });
    }
  }
}

// ─────────────────────────── Projectiles, slicks, boxes ───────────────────────────

function touchesSlick(gp: GrandPrix, x: number, y: number, r: number): number {
  for (let q = 0; q < gp.slicks.length; q++) {
    const s = gp.slicks[q];
    if ((x - s.x) ** 2 + (y - s.y) ** 2 < (r + s.r) ** 2) return q;
  }
  return -1;
}

/** Moves one projectile a step. Returns false once it's used up. */
function stepShot(gp: GrandPrix, ev: GpEvent[], s: Shot): boolean {
  const C = ITEM_TUNING;
  const dt = TUNING.dt;
  const track = gp.race.track;
  s.age++;
  if (s.kind === "heat-seeker") {
    if (s.age > ticks(C.heatSeeker.life)) return false;
    s.target = leaderOf(gp, s.owner);
    if (s.target < 0) return false;
    const t = gp.riders[s.target];
    s.prog += C.heatSeeker.speed * dt;
    const gap = t.prog - s.prog;
    const want = gap < 220 ? t.lat : 0;
    s.lat += Math.max(-300 * dt, Math.min(300 * dt, want - s.lat));
    const p = roadPoint(track, s.prog, s.lat);
    s.x = p.x;
    s.y = p.y;
    s.h = p.h;
    s.z = gap < 120 ? Math.max(4, 30 * (gap / 120)) : 30;
    if (gap > 10) return true;
    const victim = s.target;
    const vk = gp.race.racers[victim].kart;
    hitRacer(gp, ev, victim, "heat", s.owner);
    for (let j = 0; j < gp.riders.length; j++) {
      if (j === victim || !canBeHit(gp, j)) continue;
      const o = gp.race.racers[j].kart;
      if (Math.hypot(o.x - vk.x, o.y - vk.y) < C.heatSeeker.splash) hitRacer(gp, ev, j, "splash", s.owner);
    }
    return false;
  }

  let radius: number;
  let grace: number;
  if (s.kind === "homing-missile") {
    if (s.age > ticks(C.homingMissile.life)) return false;
    radius = C.homingMissile.radius;
    grace = ticks(C.homingMissile.grace);
    if (s.target >= 0 && gp.race.racers[s.target].finishAt !== null) s.target = -1;
    s.prog += C.homingMissile.speed * dt;
    let want = s.lat * 0.98;
    if (s.target >= 0) {
      const t = gp.riders[s.target];
      const gap = t.prog - s.prog;
      if (gap < -60) s.target = -1;
      else if (gap < C.homingMissile.home) want = t.lat;
    }
    const turn = C.homingMissile.turn * dt;
    s.lat += Math.max(-turn, Math.min(turn, want - s.lat));
    const p = roadPoint(track, s.prog, s.lat);
    s.x = p.x;
    s.y = p.y;
    s.h = p.h;
  } else {
    if (s.age > ticks(C.dartBlaster.life)) return false;
    radius = C.dartBlaster.radius;
    grace = ticks(C.dartBlaster.grace);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const b = track.bounds;
    if (s.x < b.x0 + radius) { s.x = b.x0 + radius; s.vx = Math.abs(s.vx); s.bounces++; }
    if (s.x > b.x1 - radius) { s.x = b.x1 - radius; s.vx = -Math.abs(s.vx); s.bounces++; }
    if (s.y < b.y0 + radius) { s.y = b.y0 + radius; s.vy = Math.abs(s.vy); s.bounces++; }
    if (s.y > b.y1 - radius) { s.y = b.y1 - radius; s.vy = -Math.abs(s.vy); s.bounces++; }
    for (const c of track.solids) {
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      const min = c.r + radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = dx / d;
      const ny = dy / d;
      s.x = c.x + nx * min;
      s.y = c.y + ny * min;
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        s.vx -= 2 * vn * nx;
        s.vy -= 2 * vn * ny;
      }
      s.bounces++;
    }
    if (s.bounces > C.dartBlaster.bounces) return false;
    s.h = Math.atan2(s.vy, s.vx);
  }

  // Oil Slicks stop it (and are cleaned up).
  const q = touchesSlick(gp, s.x, s.y, radius);
  if (q >= 0) {
    ev.push({ type: "clean", shot: s.id, slick: gp.slicks[q].id });
    gp.slicks.splice(q, 1);
    return false;
  }

  for (let j = 0; j < gp.riders.length; j++) {
    if (j === s.skip || (j === s.owner && s.age <= grace) || !canBeHit(gp, j)) continue;
    const k = gp.race.racers[j].kart;
    const rd = gp.riders[j];
    const reach = radius + hitRadius(rd);
    if ((k.x - s.x) ** 2 + (k.y - s.y) ** 2 >= reach * reach) continue;
    if (s.kind === "homing-missile" && rd.quirk.missileMiss && draw(gp) < rd.quirk.missileMiss) {
      s.skip = j;
      if (s.target === j) s.target = -1;
      ev.push({ type: "dodge", racer: j, by: s.owner });
      continue;
    }
    hitRacer(gp, ev, j, s.kind === "homing-missile" ? "missile" : "dart", s.owner);
    return false;
  }
  return true;
}

function stepSlicks(gp: GrandPrix, ev: GpEvent[]): void {
  const life = ticks(ITEM_TUNING.oilSlick.life);
  const grace = ticks(ITEM_TUNING.oilSlick.grace);
  for (let q = gp.slicks.length - 1; q >= 0; q--) {
    gp.slicks[q].age++;
    if (gp.slicks[q].age > life) gp.slicks.splice(q, 1);
  }
  for (let j = 0; j < gp.riders.length; j++) {
    const rd = gp.riders[j];
    const r = gp.race.racers[j];
    if (r.finishAt !== null || !r.kart.grounded) {
      rd.onSlick = -1;
      continue;
    }
    const k = r.kart;
    let on = -1;
    for (let q = 0; q < gp.slicks.length; q++) {
      const sl = gp.slicks[q];
      if (sl.owner === j && sl.age <= grace) continue;
      const reach = sl.r + hitRadius(rd);
      if ((k.x - sl.x) ** 2 + (k.y - sl.y) ** 2 >= reach * reach) continue;
      on = sl.id;
      if (rd.quirk.slickProof) {
        if (rd.onSlick !== sl.id) ev.push({ type: "slick-proof", racer: j });
        break;
      }
      const res = hitRacer(gp, ev, j, "slick", sl.owner);
      if (res !== "immune") {
        gp.slicks.splice(q, 1);
        on = -1;
      }
      break;
    }
    rd.onSlick = on;
  }
}

function stepBoxes(gp: GrandPrix, ev: GpEvent[]): void {
  const reach = ITEM_TUNING.boxRadius + TUNING.kartRadius;
  const back = ticks(ITEM_TUNING.boxRespawn);
  for (const b of gp.boxes) if (b.back > 0) b.back--;
  for (let j = 0; j < gp.riders.length; j++) {
    const r = gp.race.racers[j];
    if (r.finishAt !== null) continue;
    const k = r.kart;
    for (const b of gp.boxes) {
      if (b.back > 0) continue;
      if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 >= reach * reach || k.z > 14) continue;
      b.back = back;
      const rd = gp.riders[j];
      if (rd.item === null) {
        rd.item = dealItem(gp, j);
        rd.roll = ticks(ITEM_TUNING.roll);
        ev.push({ type: "box", racer: j, item: rd.item, place: rd.place });
      } else ev.push({ type: "box", racer: j, item: null, place: rd.place });
    }
  }
}

// ─────────────────────────── The step ───────────────────────────

function notePress(rd: Rider, gas: boolean, tick: number): void {
  if (gas && !rd.gasDown) rd.gasFrom = tick;
  if (!gas) rd.gasFrom = null;
  rd.gasDown = gas;
}

/** Max's window is twice as wide. */
export function startWindow(q: Quirk): { before: number; after: number } {
  const m = q.startWindow ?? 1;
  return { before: Math.round(START_WINDOW.before * m), after: Math.round(START_WINDOW.after * m) };
}

function decideStart(gp: GrandPrix, ev: GpEvent[], i: number, gas: boolean): void {
  const rd = gp.riders[i];
  if (rd.start !== null) return;
  const tick = gp.race.tick;
  notePress(rd, gas, tick);
  const w = startWindow(rd.quirk);
  if (rd.gasFrom !== null) {
    if (rd.gasFrom < -w.before) rd.start = "early";
    else if (rd.gasFrom <= w.after) {
      rd.start = "perfect";
      boostKart(gp.race.racers[i].kart, startBoostFor(rd.stats), 40);
      ev.push({ type: "boost", racer: i, why: "start" });
    } else rd.start = "late";
  } else if (tick >= w.after) rd.start = "late";
  if (rd.start !== null) ev.push({ type: "start", racer: i, result: rd.start });
}

/** Extra top speed for a computer racer far behind the leader (0 for you, and for anyone near the front). */
export function catchUpFor(gp: GrandPrix, i: number): number {
  const rd = gp.riders[i];
  if (rd.human) return 0;
  const lead = leaderOf(gp);
  if (lead < 0) return 0;
  const gap = gp.riders[lead].prog - rd.prog;
  if (gap <= CATCH_UP.from) return 0;
  return Math.min(CATCH_UP.max, (gap - CATCH_UP.from) * CATCH_UP.per);
}

function towOnto(gp: GrandPrix, i: number, s: number): void {
  const rd = gp.riders[i];
  const track = gp.race.track;
  const k = gp.race.racers[i].kart;
  const at = ((s % track.length) + track.length) % track.length;
  const p = roadPoint(track, at, 0);
  rd.near = { ...rd.near, i: Math.floor((at / track.length) * track.n) % track.n };
  k.x = p.x;
  k.y = p.y;
  k.h = p.h;
  k.vx = 0;
  k.vy = 0;
  k.speed = 0;
  k.drift = 0;
  k.charge = 0;
  k.tier = 0;
  k.swing = 0;
}

/**
 * Works out where everyone is and the places again (after changing karts by
 * hand: tests, or a server adjusting a race). gpStep does this every step.
 */
export function gpSettle(gp: GrandPrix): void {
  for (let i = 0; i < gp.riders.length; i++) locate(gp, i);
  rank(gp);
}

/**
 * Advances the race one fixed step. Pass your input; or a list with an input per
 * racer, where a missing or null entry means the computer drives that one (live
 * races with other people, and tests). Only racer 0's input goes in the log
 * (gp.log, from the very first countdown step), so replayGrandPrix() plays
 * back a race against the cast exactly.
 */
export function gpStep(gp: GrandPrix, input: GpInput | (GpInput | null | undefined)[] = NO_GP_INPUT): GpStepEvents {
  const list = Array.isArray(input) ? input : [input];
  const raw = quantizeGp(list[0] ?? NO_GP_INPUT);
  gp.log.push(packGpInput(raw));
  const out: GpStepEvents = { beep: 0, go: false, racers: [], events: [] };
  if (gp.over) return out;
  const race = gp.race;
  const n = race.racers.length;
  const ev = out.events;

  // 1. Inputs: yours, and each computer racer's from the state as the step begins.
  const inputs: GpInput[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const rd = gp.riders[i];
    const given = i === 0 ? raw : list[i];
    inputs[i] = given ? quantizeGp(given) : rd.brain && rd.profile ? aiDrive(gp, i, rd.brain, rd.profile) : NO_GP_INPUT;
  }

  if (race.tick < 0) {
    for (let i = 0; i < n; i++) {
      notePress(gp.riders[i], !!inputs[i].gas, race.tick);
      gp.riders[i].itemDown = !!inputs[i].item;
    }
    const c = raceStep(race, NO_INPUT);
    out.beep = c.beep;
    out.go = c.go;
    return out;
  }

  // 2. Timers.
  if (gp.shockWait > 0) gp.shockWait--;
  for (let i = 0; i < n; i++) {
    const rd = gp.riders[i];
    if (rd.roll > 0 && --rd.roll === 0 && rd.item) ev.push({ type: "ready", racer: i, item: rd.item });
    if (rd.bubble > 0) rd.bubble--;
    if (rd.invuln > 0) rd.invuln--;
    if (rd.slow > 0) rd.slow--;
    if (rd.smoke > 0) rd.smoke--;
    if (rd.spin > 0 && --rd.spin === 0 && rd.pending > 0) {
      boostKart(race.racers[i].kart, rd.pending, 40);
      ev.push({ type: "boost", racer: i, why: rd.quirk.angryBoost ? "angry" : "chat" });
      rd.pending = 0;
    }
    if (rd.brain?.tow) {
      rd.brain.tow = false;
      towOnto(gp, i, rd.s);
      ev.push({ type: "tow", racer: i, missed: false });
    } else if (race.racers[i].finishAt === null) {
      const geo = trackGeo(race.track);
      const gs = geo.gateS[race.racers[i].passed % geo.gateS.length];
      const past = (((rd.s - gs) % geo.L) + geo.L) % geo.L;
      if (past > MISSED_GATE.past && past < geo.L / 2) {
        towOnto(gp, i, gs - MISSED_GATE.back);
        if (rd.brain) {
          rd.brain.stuck = 0;
          rd.brain.best = -1e9;
        }
        ev.push({ type: "tow", racer: i, missed: true });
      }
    }
  }

  // 3. Starts and items.
  for (let i = 0; i < n; i++) {
    const rd = gp.riders[i];
    const r = race.racers[i];
    decideStart(gp, ev, i, !!inputs[i].gas);
    const press = !!inputs[i].item;
    if (press && !rd.itemDown && rd.item && rd.roll === 0 && rd.spin === 0 && r.finishAt === null) spendItem(gp, ev, i);
    rd.itemDown = press;
  }

  // 4. Physics.
  const drag = Math.exp(-ITEM_TUNING.spinDrag * TUNING.dt);
  for (let i = 0; i < n; i++) {
    const rd = gp.riders[i];
    const r = race.racers[i];
    const k = r.kart;
    let inp: KartInput = inputs[i];
    if (rd.spin > 0) {
      inp = SPIN_INPUT;
      if (k.grounded) {
        k.vx *= drag;
        k.vy *= drag;
      }
    } else if (rd.quirk.wander) {
      inp = { ...inp, steer: Math.max(-1, Math.min(1, inp.steer + wanderAt(race.tick, rd.quirk.wander))) };
    }
    const eff = rd.eff;
    const b = rd.base;
    let top = b.top;
    if (rd.quirk.perPlace) top *= 1 + rd.quirk.perPlace * Math.max(0, Math.min(rd.quirk.maxPlaces ?? 99, rd.grid + 1 - rd.place));
    if (rd.slow > 0) top *= ITEM_TUNING.shockwave.top;
    top *= 1 + catchUpFor(gp, i);
    eff.top = top;
    eff.accel = b.accel;
    eff.turn = b.turn;
    eff.grip = b.grip;
    eff.mass = b.mass;
    eff.charge = b.charge;
    r.stats = eff;
    const after = r.finishAt !== null ? autopilot(race.track, k, { offset: rd.brain?.lane ?? 0, near: rd.near }) : undefined;
    out.racers.push(stepRacer(race, r, inp, after));
  }

  // 5. Bumps.
  bumps(gp, ev);

  // 6. Projectiles, Oil Slicks, Item Boxes.
  for (let q = 0; q < gp.shots.length; ) {
    const s = gp.shots[q];
    if (stepShot(gp, ev, s)) q++;
    else {
      gp.shots.splice(q, 1);
      ev.push({ type: "shot-gone", shot: s.id, kind: s.kind });
    }
  }
  stepSlicks(gp, ev);
  stepBoxes(gp, ev);

  // 7. Where everyone is.
  for (let i = 0; i < n; i++) locate(gp, i);
  rank(gp);

  race.tick++;
  const me = race.racers[0];
  if (gp.endAt === null && me.finishAt !== null) gp.endAt = race.tick + ticks(gp.runOn);
  if (race.racers.every((r) => r.finishAt !== null) || (gp.endAt !== null && race.tick >= gp.endAt) || race.tick >= MAX_RACE_TICKS) {
    gp.over = true;
    ev.push({ type: "over" });
  }
  return out;
}

/** Plays a race again from its options and your input log: the same seed and inputs give the same race. */
export function replayGrandPrix(opts: GrandPrixOpts, log: number[]): GrandPrix {
  const gp = createGrandPrix(opts);
  for (const v of log) gpStep(gp, unpackGpInput(v));
  return gp;
}

// ─────────────────────────── Reading the race ───────────────────────────

export interface Standing {
  racer: number;
  id: string;
  name: string;
  place: number;
  /** Finish time in steps, or null if they hadn't finished when the race ended. */
  finishAt: number | null;
  /** For someone still racing when it ended: their likely finish (steps) at their average pace so far. */
  estimate: number | null;
  human: boolean;
}

export function standings(gp: GrandPrix): Standing[] {
  const race = gp.race;
  const total = race.laps * trackGeo(race.track).L;
  return gp.order.map((idx, p) => {
    const r = race.racers[idx];
    const rd = gp.riders[idx];
    let estimate: number | null = null;
    if (r.finishAt === null && race.tick > 0) {
      const pace = Math.max(1, rd.prog) / race.tick;
      estimate = race.tick + Math.max(0, total - rd.prog) / Math.max(pace, 0.5);
    }
    return { racer: idx, id: rd.id, name: rd.name, place: p + 1, finishAt: r.finishAt, estimate, human: rd.human };
  });
}

/** The item a racer holds: what it is, and whether it's still spinning in the roulette. */
export function heldItem(gp: GrandPrix, i: number): { item: ItemId | null; rolling: boolean } {
  const rd = gp.riders[i];
  return { item: rd.item, rolling: rd.roll > 0 };
}

/** How far through its spin-out a racer is (0..1, for drawing the spin), or null. */
export function spinShare(gp: GrandPrix, i: number): number | null {
  const rd = gp.riders[i];
  return rd.spin > 0 && rd.spinFor > 0 ? 1 - rd.spin / rd.spinFor : null;
}

function fnvNum(h: number, v: number, dv: DataView): number {
  dv.setFloat64(0, Number.isFinite(v) ? v : -1e300);
  for (let i = 0; i < 8; i++) {
    h ^= dv.getUint8(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * A fingerprint of the whole race state (every kart, item, timer, box,
 * projectile, slick and random-number state). Two races that match here match
 * everywhere that matters.
 */
export function gpHash(gp: GrandPrix): string {
  const dv = new DataView(new ArrayBuffer(8));
  let h = 2166136261;
  const f = (v: number) => (h = fnvNum(h, v, dv));
  f(gp.race.tick);
  f(gp.rng);
  f(gp.nextId);
  f(gp.shockWait);
  f(gp.over ? 1 : 0);
  gp.order.forEach(f);
  gp.race.racers.forEach((r, i) => {
    const k = r.kart;
    [k.x, k.y, k.z, k.vx, k.vy, k.vz, k.h, k.steer, k.charge, k.boost, k.speed, k.drift, k.tier, r.passed, r.maxPassed, r.finishAt ?? -1].forEach(f);
    const rd = gp.riders[i];
    [rd.roll, rd.bubble, rd.spin, rd.invuln, rd.slow, rd.smoke, rd.pending, rd.prog, rd.lat, rd.place, rd.gasFrom ?? -999].forEach(f);
    f(rd.item ? ITEM_IDS.indexOf(rd.item) + 1 : 0);
    if (rd.brain) [rd.brain.rng, rd.brain.lane, rd.brain.noise, rd.brain.stuck].forEach(f);
  });
  for (const b of gp.boxes) f(b.back);
  for (const s of gp.shots) [s.id, s.x, s.y, s.prog, s.lat, s.target, s.age, s.bounces].forEach(f);
  for (const s of gp.slicks) [s.id, s.x, s.y, s.age].forEach(f);
  return h.toString(16).padStart(8, "0");
}
