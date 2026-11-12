/**
 * One Airtime run (pure, client-safe): the player, the jetpack, the roofs and
 * planks, enemies, shots, pickups, hearts and the score, one fixed 1/60 s step
 * at a time. Deterministic: no clock, no Math.random, no Math.sin (see wave.ts),
 * so the same seed and the same holds give the same run, bit for bit. Every
 * step's hold is recorded (run-length), ready for a daily run whose score the
 * server can replay later.
 *
 * Input each step: hold (the jetpack: hold to rise, let go to fall), fire (hold
 * to shoot at the weapon's rate) and aim (whole degrees, -90 straight down to 90
 * straight up; you always face forward, so only the front half circle). The
 * level moves you forward on its own; land on any roof or plank and you run
 * along it. A shot bends a few degrees toward an enemy close to your line (aim
 * assist, TUNING.assistDeg).
 */

import type { EnemyKind, WeaponKind } from "./content";
import { buildLevel, solidsNear, type Level, type PickupKind, type Solid } from "./level";
import { foeScale, TUNING } from "./tuning";
import { dcos, dsin } from "./wave";

export interface Input {
  hold: boolean;
  fire: boolean;
  /** Whole degrees, -90 (straight down) to 90 (straight up); anything else is rounded and clamped. */
  aim: number;
}

export const NO_INPUT: Input = { hold: false, fire: false, aim: 0 };

/** An aim as the sim uses it: a whole number of degrees from -90 to 90. */
export function normAim(aim: number): number {
  if (!Number.isFinite(aim)) return 0;
  return Math.max(-90, Math.min(90, Math.round(aim)));
}

/** One step's input in one small number (hold, fire, aim): what a run records and replays. */
export function packInput(i: Input): number {
  return (normAim(i.aim) + 90) * 4 + (i.fire ? 2 : 0) + (i.hold ? 1 : 0);
}

export function unpackInput(n: number): Input {
  return { hold: (n & 1) === 1, fire: (n & 2) === 2, aim: (n >> 2) - 90 };
}

/** A run's recorded inputs (value, steps, value, steps, …), one per step. */
export function* recordedInputs(inputs: number[]): Generator<Input> {
  for (let i = 0; i + 1 < inputs.length; i += 2) {
    const input = unpackInput(inputs[i]);
    for (let k = 0; k < inputs[i + 1]; k++) yield input;
  }
}

/** cos and sin of every whole degree from -90 to 90, from plain arithmetic (see wave.ts). */
const AIM_DIR = (() => {
  const t = new Float64Array(362);
  for (let d = -90; d <= 90; d++) {
    const a = (d * Math.PI) / 180;
    t[(d + 90) * 2] = dcos(a);
    t[(d + 90) * 2 + 1] = dsin(a);
  }
  return t;
})();

/** The unit direction for an aim. */
export function aimDir(aim: number): [number, number] {
  const k = (normAim(aim) + 90) * 2;
  return [AIM_DIR[k], AIM_DIR[k + 1]];
}

export interface Player {
  x: number;
  /** Feet. */
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  holding: boolean;
  /** Ticks of blinking after a hit (nothing hurts you while it lasts). */
  invuln: number;
  /** Pressed against a wall this step. */
  blocked: boolean;
  /** Being dropped onto a roof after a fall (no forward motion until you land). */
  dropping: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** Center x; y is the bottom. */
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  alive: boolean;
  /** Left behind (no longer in play, not defeated). */
  gone: boolean;
  /** A walker's patrol. */
  x0: number;
  x1: number;
  dir: number;
  /** A flyer's anchor. */
  ax: number;
  ay: number;
  awake: boolean;
  /** Ticks since it woke. */
  t: number;
  /** A turret's ticks to its next shot, and the charge glow before it (ticks left, 0 = not charging). */
  cool: number;
  charge: number;
  /** Ticks of the white flash after a hit. */
  flash: number;
  /** Where a turret's barrel points (unit vector). */
  aimX: number;
  aimY: number;
}

export interface Shot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  foe: boolean;
  kind: WeaponKind | "turret";
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  taken: boolean;
}

export interface LevelStats {
  level: number;
  meters: number;
  enemies: number;
  /** Weapons and hearts. */
  pickups: number;
  stars: number;
  hits: number;
  ticks: number;
  clearBonus: number;
  noHitBonus: number;
  /** Score when the level started, and what it added. */
  startScore: number;
  levelScore: number;
}

export type Phase = "play" | "cleared" | "over" | "banked";

export interface Run {
  seed: number;
  level: Level;
  phase: Phase;
  /** Steps in this level, and in the whole run. */
  tick: number;
  ticks: number;
  player: Player;
  hearts: number;
  weapon: WeaponKind;
  /** Steps left on Spread or Rapid. */
  weaponTicks: number;
  cool: number;
  /** Where you're aiming (whole degrees) and whether fire is held, as of the last step. */
  aim: number;
  firing: boolean;
  enemies: Enemy[];
  shots: Shot[];
  pickups: Pickup[];
  score: number;
  /** Furthest x this level (distance only counts once). */
  maxX: number;
  /** Meters over the whole run. */
  meters: number;
  stats: LevelStats;
  cleared: LevelStats[];
  nextId: number;
  /** Every step's input, packed (packInput) and run-length: value, steps, value, steps, … */
  inputs: number[];
}

export interface StepEvents {
  fired: { x: number; y: number; vx: number; vy: number; kind: WeaponKind }[];
  /** Your shots hitting something (an enemy or a wall). */
  impacts: { x: number; y: number; enemy: boolean }[];
  kills: { id: number; x: number; y: number; kind: EnemyKind; stomp: boolean; points: number }[];
  foeFired: { x: number; y: number }[];
  hurt: { x: number; y: number; cause: "enemy" | "shot" | "load" | "fall" } | null;
  fell: boolean;
  respawned: boolean;
  /** Fall speed on landing (0 = didn't land). */
  landed: number;
  liftOff: boolean;
  bumped: boolean;
  collected: { x: number; y: number; kind: PickupKind; points: number; full: boolean }[];
  weaponOut: boolean;
  cleared: boolean;
  over: boolean;
}

function noEvents(): StepEvents {
  return { fired: [], impacts: [], kills: [], foeFired: [], hurt: null, fell: false, respawned: false, landed: 0, liftOff: false, bumped: false, collected: [], weaponOut: false, cleared: false, over: false };
}

const T = TUNING;
const DT = T.dt;
const W2 = T.playerW / 2;
const PH = T.playerH;
const EPS = 1e-6;
const TAU = Math.PI * 2;
const near: Solid[] = [];

function freshStats(level: number, score: number): LevelStats {
  return { level, meters: 0, enemies: 0, pickups: 0, stars: 0, hits: 0, ticks: 0, clearBonus: 0, noHitBonus: 0, startScore: score, levelScore: 0 };
}

function spawnEnemies(run: Run): Enemy[] {
  return run.level.enemies.map((s) => {
    const def = T[s.kind];
    return {
      id: run.nextId++,
      kind: s.kind,
      x: s.x,
      y: s.y,
      w: def.w,
      h: def.h,
      hp: def.hp,
      alive: true,
      gone: false,
      x0: s.x0,
      x1: s.x1,
      dir: -1,
      ax: s.x,
      ay: s.y,
      awake: false,
      t: 0,
      cool: 0,
      charge: 0,
      flash: 0,
      aimX: -1,
      aimY: 0,
    };
  });
}

function enterLevel(run: Run, level: Level): void {
  run.level = level;
  run.tick = 0;
  run.player = { x: level.start.x, y: level.start.y, vx: level.speed, vy: 0, grounded: true, holding: false, invuln: 0, blocked: false, dropping: false };
  run.enemies = spawnEnemies(run);
  run.pickups = level.pickups.map((p) => ({ id: run.nextId++, kind: p.kind, x: p.x, y: p.y, taken: false }));
  run.shots = [];
  run.cool = 0;
  run.maxX = level.start.x;
  run.stats = freshStats(level.number, run.score);
  run.phase = "play";
}

/** A new run from a seed, starting at level 1 (or `startLevel`, for checks and filming). */
export function createRun(seed: number, startLevel = 1): Run {
  return createRunOn(buildLevel(seed, startLevel), seed);
}

/** A run on a level you built (the tests fly bare levels this way). */
export function createRunOn(level: Level, seed = level.seed): Run {
  const run = {
    seed,
    phase: "play",
    ticks: 0,
    hearts: T.hearts,
    weapon: "blaster",
    weaponTicks: 0,
    score: 0,
    meters: 0,
    cleared: [],
    nextId: 1,
    aim: 0,
    firing: false,
    inputs: [],
  } as unknown as Run;
  enterLevel(run, level);
  return run;
}

/** After "Level cleared": the next level, a little faster and busier. One heart back; the score keeps adding. */
export function nextLevel(run: Run): void {
  if (run.phase !== "cleared") return;
  run.hearts = Math.min(T.hearts, run.hearts + 1);
  enterLevel(run, buildLevel(run.seed, run.level.number + 1));
}

/** Ends the run with the score as it stands (from the Level cleared card). */
export function bank(run: Run): void {
  if (run.phase === "cleared" || run.phase === "play") run.phase = "banked";
}

/** Where a crane's load is at a step. */
export function loadAt(l: Level["loads"][number], tick: number): { x: number; y: number; angle: number } {
  const angle = l.amp * dsin((TAU * (tick + l.phase)) / l.period);
  return { x: l.px + l.len * dsin(angle), y: l.py - l.len * dcos(angle), angle };
}

function overlaps(ax0: number, ax1: number, ay0: number, ay1: number, bx0: number, bx1: number, by0: number, by1: number): boolean {
  return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
}

/** Your hurt box. */
function hurtBox(p: Player): [number, number, number, number] {
  const hw = T.hurtW / 2;
  return [p.x - hw, p.x + hw, p.y + T.hurtBottom, p.y + T.hurtTop];
}

function supported(level: Level, x: number, y: number): boolean {
  const a = x - W2 + 0.02;
  const b = x + W2 - 0.02;
  for (const s of solidsNear(level, a, b, near)) if (Math.abs(s.y1 - y) < EPS && s.x0 < b && s.x1 > a) return true;
  for (const l of level.ledges) if (Math.abs(l.y - y) < EPS && l.x0 < b && l.x1 > a) return true;
  return false;
}

function recordInput(run: Run, input: Input): void {
  const v = packInput(input);
  const n = run.inputs.length;
  if (n >= 2 && run.inputs[n - 2] === v) run.inputs[n - 1]++;
  else run.inputs.push(v, 1);
}

function hurt(run: Run, ev: StepEvents, cause: "enemy" | "shot" | "load", x: number, y: number): boolean {
  const p = run.player;
  if (p.invuln > 0 || run.phase !== "play") return false;
  run.hearts--;
  run.stats.hits++;
  p.invuln = T.invulnTicks;
  ev.hurt = { x, y, cause };
  if (run.hearts <= 0) {
    run.phase = "over";
    ev.over = true;
  }
  return true;
}

/** After a fall: drop onto the next roof ahead. */
function respawn(run: Run, ev: StepEvents): void {
  const p = run.player;
  let roof: Solid | null = null;
  for (const s of run.level.solids) {
    if (s.kind !== "roof" || s.x1 < p.x + 3) continue;
    if (!roof || s.x0 < roof.x0) roof = s;
  }
  if (!roof) return;
  p.x = Math.max(roof.x0 + 1.4, Math.min(p.x, roof.x1 - 3));
  p.y = roof.y1 + 2.5;
  p.vy = 0;
  p.grounded = false;
  p.dropping = true;
  p.invuln = T.invulnTicks;
  // Clear turret shots near where you come back.
  run.shots = run.shots.filter((s) => !s.foe || Math.abs(s.x - p.x) > 14);
  ev.respawned = true;
}

function movePlayer(run: Run, input: Input, ev: StepEvents): void {
  const p = run.player;
  const L = run.level;
  p.holding = input.hold;
  p.vx = p.dropping ? 0 : L.speed;
  if (p.grounded && input.hold) {
    p.vy = Math.max(p.vy, T.liftOff);
    p.grounded = false;
    ev.liftOff = true;
  }
  if (!p.grounded) {
    let a = -T.gravity;
    if (input.hold) a += T.thrust * (p.vy < 0 ? T.thrustCatch : 1);
    p.vy += a * DT;
    if (p.vy > T.maxRise) p.vy = T.maxRise;
    if (p.vy < -T.maxFall) p.vy = -T.maxFall;
  }

  // Across: walls stop you; a low ledge is stepped onto.
  p.blocked = false;
  if (p.vx > 0) {
    let nx = p.x + p.vx * DT;
    solidsNear(L, nx - W2 - 0.1, nx + W2 + 0.1, near);
    for (const s of near) {
      if (!overlaps(nx - W2, nx + W2, p.y + EPS, p.y + PH - EPS, s.x0, s.x1, s.y0, s.y1)) continue;
      if (p.x + W2 > s.x0 + EPS) continue; // already past its face
      const rise = s.y1 - p.y;
      const headroom = near.every((o) => o === s || !overlaps(nx - W2, nx + W2, s.y1 + EPS, s.y1 + PH, o.x0, o.x1, o.y0, o.y1));
      if (s.kind === "roof" && rise > 0 && rise <= T.stepUp && headroom) {
        p.y = s.y1;
        p.vy = 0;
        p.grounded = true;
      } else {
        nx = Math.min(nx, s.x0 - W2 - EPS);
        p.blocked = true;
      }
    }
    p.x = Math.max(p.x, nx);
    if (p.blocked) ev.bumped = true;
  }

  // Up and down.
  if (p.grounded) {
    if (!supported(L, p.x, p.y)) p.grounded = false;
    return;
  }
  const ny = p.y + p.vy * DT;
  solidsNear(L, p.x - W2, p.x + W2, near);
  if (p.vy <= 0) {
    let land = -Infinity;
    for (const s of near) if (s.x0 < p.x + W2 && s.x1 > p.x - W2 && s.y1 <= p.y + EPS && s.y1 >= ny) land = Math.max(land, s.y1);
    for (const l of L.ledges) if (l.x0 < p.x + W2 && l.x1 > p.x - W2 && l.y <= p.y + EPS && l.y >= ny) land = Math.max(land, l.y);
    if (land > -Infinity) {
      ev.landed = -p.vy;
      p.y = land;
      p.vy = 0;
      p.grounded = true;
      p.dropping = false;
    } else p.y = ny;
  } else {
    let lid = Infinity;
    for (const s of near) if (s.x0 < p.x + W2 && s.x1 > p.x - W2 && s.y0 >= p.y + PH - EPS && s.y0 <= ny + PH) lid = Math.min(lid, s.y0);
    if (lid < Infinity) {
      p.y = lid - PH;
      p.vy = 0;
    } else p.y = ny;
  }
  if (p.y + PH > T.ceiling) {
    p.y = T.ceiling - PH;
    if (p.vy > 0) p.vy = 0;
  }
}

/** True if the segment from (x0, y0) to (x1, y1) crosses no solid. */
function clearLine(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const s of solidsNear(level, Math.min(x0, x1), Math.max(x0, x1), near)) {
    let t0 = 0;
    let t1 = 1;
    let blocked = true;
    const edges: [number, number, number][] = [
      [-dx, x0 - s.x0, 0],
      [dx, s.x1 - x0, 0],
      [-dy, y0 - s.y0, 0],
      [dy, s.y1 - y0, 0],
    ];
    for (const [pp, q] of edges) {
      if (pp === 0) {
        if (q < 0) {
          blocked = false;
          break;
        }
        continue;
      }
      const r = q / pp;
      if (pp < 0) {
        if (r > t1) {
          blocked = false;
          break;
        }
        if (r > t0) t0 = r;
      } else {
        if (r < t0) {
          blocked = false;
          break;
        }
        if (r < t1) t1 = r;
      }
    }
    if (blocked && t0 <= t1) return false;
  }
  return true;
}

/**
 * Fires along your aim. A shot bends toward an enemy within TUNING.assistDeg of the line (the
 * one closest to it, within reach and in the clear); Spread's side shots fan out from there.
 */
function fire(run: Run, ev: StepEvents): void {
  const p = run.player;
  const [ax, ay] = aimDir(run.aim);
  const sx = p.x + T.gunX;
  const sy = p.y + T.gunY;
  const gx = sx + ax * T.muzzle;
  const gy = sy + ay * T.muzzle;
  let ux = ax;
  let uy = ay;
  let best: number = T.assistCos;
  for (const e of run.enemies) {
    if (!e.alive || e.gone) continue;
    const dx = e.x - gx;
    const dy = e.y + e.h / 2 - gy;
    const d2 = dx * dx + dy * dy;
    if (d2 > T.assistRange * T.assistRange || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const dot = (dx * ax + dy * ay) / d;
    if (dot < best) continue;
    if (!clearLine(run.level, gx, gy, e.x, e.y + e.h / 2)) continue;
    best = dot;
    ux = dx / d;
    uy = dy / d;
  }
  const kind = run.weapon;
  const add = (vx: number, vy: number) => {
    const s: Shot = { id: run.nextId++, x: gx, y: gy, vx: vx * T.shotSpeed, vy: vy * T.shotSpeed, life: T.shotLife, foe: false, kind };
    run.shots.push(s);
    ev.fired.push({ x: gx, y: gy, vx: s.vx, vy: s.vy, kind });
  };
  add(ux, uy);
  if (kind === "spread") {
    const c = T.spreadCos;
    const sn = T.spreadSin;
    add(ux * c - uy * sn, ux * sn + uy * c);
    add(ux * c + uy * sn, -ux * sn + uy * c);
  }
  run.cool = T.cooldown[kind];
}

function kill(run: Run, e: Enemy, ev: StepEvents, stomp: boolean): void {
  e.alive = false;
  e.hp = 0;
  const points = T.score[e.kind] + (stomp ? T.score.stomp : 0);
  run.score += points;
  run.stats.enemies++;
  ev.kills.push({ id: e.id, x: e.x, y: e.y + e.h / 2, kind: e.kind, stomp, points });
}

function updateEnemies(run: Run, prevY: number, ev: StepEvents): void {
  const p = run.player;
  const scale = foeScale(run.level.number);
  const [hx0, hx1, hy0, hy1] = hurtBox(p);
  for (const e of run.enemies) {
    if (!e.alive || e.gone) continue;
    if (e.flash > 0) e.flash--;
    if (e.kind === "walker") {
      if (!e.awake && p.x > e.x0 - T.walker.wake) e.awake = true;
      if (e.awake) {
        e.x += e.dir * T.walker.speed * scale * DT;
        if (e.x <= e.x0) {
          e.x = e.x0;
          e.dir = 1;
        } else if (e.x >= e.x1) {
          e.x = e.x1;
          e.dir = -1;
        }
      }
      if (e.x < p.x - 30) e.gone = true;
    } else if (e.kind === "flyer") {
      if (!e.awake && p.x > e.ax - T.flyer.wake) e.awake = true;
      if (e.awake) {
        e.t++;
        e.x = e.ax - T.flyer.drift * e.t * DT;
        e.y = e.ay + T.flyer.amp * dsin((TAU * e.t) / T.flyer.periodTicks);
      }
      if (e.x < p.x - 25) e.gone = true;
    } else {
      // Turret: wakes when you come in range from the left, charges, fires a slow shot at you.
      const mx = e.x - 0.45;
      const my = e.y + 0.85;
      const dx = p.x - mx;
      const dy = p.y + 0.8 - my;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.aimX = dx / d;
      e.aimY = dy / d;
      const active = p.x > e.x - T.turret.range && p.x < e.x - 1.2;
      if (active) {
        if (!e.awake) {
          e.awake = true;
          e.cool = T.turret.firstShot;
        }
        e.cool--;
        e.charge = e.cool <= T.turret.charge ? Math.max(0, e.cool) : 0;
        if (e.cool <= 0) {
          const sp = T.turret.shotSpeed * scale;
          run.shots.push({ id: run.nextId++, x: mx + e.aimX * 0.7, y: my + e.aimY * 0.7, vx: e.aimX * sp, vy: e.aimY * sp, life: T.turret.shotLife, foe: true, kind: "turret" });
          ev.foeFired.push({ x: mx + e.aimX * 0.7, y: my + e.aimY * 0.7 });
          e.cool = T.turret.cooldown;
          e.charge = 0;
        }
      } else e.charge = 0;
      if (e.x < p.x - 30) e.gone = true;
    }
    // Landing on a walker defeats it; touching anything else hurts.
    const ex0 = e.x - e.w / 2;
    const ex1 = e.x + e.w / 2;
    if (e.kind === "walker" && p.vy < 0 && prevY >= e.y + e.h - 0.35 && overlaps(p.x - W2, p.x + W2, p.y, p.y + PH, ex0, ex1, e.y, e.y + e.h)) {
      kill(run, e, ev, true);
      p.vy = T.bounce;
      p.grounded = false;
      p.dropping = false;
    } else if (overlaps(hx0, hx1, hy0, hy1, ex0, ex1, e.y, e.y + e.h)) hurt(run, ev, "enemy", p.x, p.y + 0.8);
  }
}

function updateShots(run: Run, ev: StepEvents): void {
  const p = run.player;
  const [hx0, hx1, hy0, hy1] = hurtBox(p);
  const keep: Shot[] = [];
  for (const s of run.shots) {
    s.x += s.vx * DT;
    s.y += s.vy * DT;
    s.life--;
    let done = s.life <= 0;
    if (!done && !s.foe) {
      for (const e of run.enemies) {
        if (!e.alive || e.gone) continue;
        if (s.x < e.x - e.w / 2 - 0.15 || s.x > e.x + e.w / 2 + 0.15 || s.y < e.y - 0.15 || s.y > e.y + e.h + 0.15) continue;
        e.hp--;
        e.flash = 6;
        ev.impacts.push({ x: s.x, y: s.y, enemy: true });
        if (e.hp <= 0) kill(run, e, ev, false);
        done = true;
        break;
      }
    } else if (!done && s.foe) {
      const r = T.turret.shotR;
      const cx = Math.max(hx0, Math.min(s.x, hx1));
      const cy = Math.max(hy0, Math.min(s.y, hy1));
      if ((s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy) < r * r && p.invuln === 0 && run.phase === "play") {
        hurt(run, ev, "shot", s.x, s.y);
        done = true;
      }
    }
    if (!done) {
      for (const w of solidsNear(run.level, s.x, s.x, near)) {
        if (s.x >= w.x0 && s.x <= w.x1 && s.y >= w.y0 && s.y <= w.y1) {
          if (!s.foe) ev.impacts.push({ x: s.x, y: s.y, enemy: false });
          done = true;
          break;
        }
      }
    }
    if (!done) keep.push(s);
  }
  run.shots = keep;
}

function collect(run: Run, ev: StepEvents): void {
  const p = run.player;
  for (const k of run.pickups) {
    if (k.taken) continue;
    if (Math.abs(k.x - p.x) > 0.85 || k.y < p.y - 0.4 || k.y > p.y + PH + 0.4) continue;
    k.taken = true;
    let points = 0;
    let full = false;
    if (k.kind === "star") {
      points = T.score.star;
      run.stats.stars++;
    } else if (k.kind === "heart") {
      run.stats.pickups++;
      if (run.hearts < T.hearts) run.hearts++;
      else {
        full = true;
        points = T.score.heartFull;
      }
    } else {
      run.stats.pickups++;
      run.weapon = k.kind;
      run.weaponTicks = T.pickupTicks;
      run.cool = Math.min(run.cool, 2);
      points = T.score.pickup;
    }
    run.score += points;
    ev.collected.push({ x: k.x, y: k.y, kind: k.kind, points, full });
  }
}

/** One fixed step. */
export function step(run: Run, input: Input): StepEvents {
  const ev = noEvents();
  if (run.phase !== "play") return ev;
  input = { hold: !!input.hold, fire: !!input.fire, aim: normAim(input.aim) };
  recordInput(run, input);
  run.aim = input.aim;
  run.firing = input.fire;
  const p = run.player;
  const prevY = p.y;
  movePlayer(run, input, ev);

  // Off the bottom: a heart, then the next roof.
  if (p.y < T.killY) {
    ev.fell = true;
    run.hearts--;
    run.stats.hits++;
    ev.hurt = { x: p.x, y: T.killY + 1, cause: "fall" };
    if (run.hearts <= 0) {
      run.phase = "over";
      ev.over = true;
    } else respawn(run, ev);
  }

  // The crane loads.
  if (run.phase === "play" && p.invuln === 0) {
    const [hx0, hx1, hy0, hy1] = hurtBox(p);
    for (const l of run.level.loads) {
      if (Math.abs(l.px - p.x) > l.len + 3) continue;
      const at = loadAt(l, run.tick);
      if (overlaps(hx0, hx1, hy0, hy1, at.x - l.w / 2, at.x + l.w / 2, at.y - l.h / 2, at.y + l.h / 2)) {
        hurt(run, ev, "load", at.x, at.y);
        break;
      }
    }
  }

  if (run.phase === "play") updateEnemies(run, prevY, ev);

  // Your weapon: fires at its rate while fire is held.
  if (run.cool > 0) run.cool--;
  if (run.phase === "play" && input.fire && run.cool <= 0) fire(run, ev);
  updateShots(run, ev);
  if (run.phase === "play") collect(run, ev);

  if (run.weapon !== "blaster" && --run.weaponTicks <= 0) {
    run.weapon = "blaster";
    run.weaponTicks = 0;
    ev.weaponOut = true;
  }
  if (p.invuln > 0) p.invuln--;

  // Distance.
  if (p.x > run.maxX) {
    const sx = run.level.start.x;
    const before = Math.floor((run.maxX - sx) * T.score.perMeter);
    const after = Math.floor((p.x - sx) * T.score.perMeter);
    run.score += after - before;
    run.meters += p.x - run.maxX;
    run.maxX = p.x;
    run.stats.meters = run.maxX - sx;
  }

  run.tick++;
  run.ticks++;
  run.stats.ticks = run.tick;

  if (run.phase === "play" && p.x >= run.level.gateX) {
    const n = run.level.number;
    run.stats.clearBonus = T.score.clear * n;
    run.stats.noHitBonus = run.stats.hits === 0 ? T.score.noHit * n : 0;
    run.score += run.stats.clearBonus + run.stats.noHitBonus;
    run.stats.levelScore = run.score - run.stats.startScore;
    run.cleared.push({ ...run.stats });
    run.phase = "cleared";
    ev.cleared = true;
  }
  if (run.phase === "over") run.stats.levelScore = run.score - run.stats.startScore;
  return ev;
}

/** How far through the level you are (0..1). */
export function progress(run: Run): number {
  const L = run.level;
  return Math.max(0, Math.min(1, (run.player.x - L.start.x) / (L.gateX - L.start.x)));
}

/** A hash of everything that matters in a run (FNV-1a over the numbers' bits), for determinism checks. */
export function stateHash(run: Run): string {
  const f = new Float64Array(1);
  const u = new Uint32Array(f.buffer);
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    f[0] = n;
    for (let i = 0; i < 2; i++) {
      h ^= u[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const p = run.player;
  [run.level.number, run.tick, run.ticks, run.hearts, run.score, run.cool, run.weaponTicks, run.maxX, run.aim, run.firing ? 1 : 0, p.x, p.y, p.vx, p.vy, p.invuln, p.grounded ? 1 : 0].forEach(mix);
  mix(["play", "cleared", "over", "banked"].indexOf(run.phase));
  mix(["blaster", "spread", "rapid"].indexOf(run.weapon));
  for (const e of run.enemies) [e.x, e.y, e.hp, e.alive ? 1 : 0, e.gone ? 1 : 0, e.cool, e.t].forEach(mix);
  for (const s of run.shots) [s.x, s.y, s.vx, s.vy, s.life].forEach(mix);
  for (const k of run.pickups) mix(k.taken ? 1 : 0);
  return h.toString(16).padStart(8, "0");
}
