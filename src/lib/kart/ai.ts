/**
 * Computer racers (pure, client-safe). Each one drives with the autopilot plus
 * a personality: a skill level from their 1-5 stats and who they are, their own
 * line across the road, steering that isn't perfect, drifts they sometimes skip
 * or let go early, a pace they hold, and items used when they'll count.
 *
 * A driver's random numbers come from its own Brain (part of the race's data),
 * so the race stays a pure function of the seed and your inputs. The same code
 * drives "you" in headless checks (createPlayerBot), with its own Brain kept
 * outside the race so the race replays from your inputs alone.
 *
 * Item habits:
 * - Shield: kept in the slot for defense (it blocks the next hit while held).
 * - Oil Slick: dropped when someone is close behind.
 * - Homing Missile: fired when the racer ahead is in range.
 * - Dart Blaster: fired when someone is straight ahead.
 * - Coffee and Energy Drink: used on straights (or to get off the grass).
 * - Heat Seeker, Shockwave, Smoke Bomb: used when there's someone ahead to use them on.
 */

import { autopilot } from "./autopilot";
import type { RacerStats } from "./content";
import { aheadOf, behindOf, bendAhead, halfWidthAt, trackGeo, turnAhead, type Difficulty, type GpInput, type GrandPrix } from "./grandprix";
import { TUNING } from "./physics";
import { draw } from "./rng";
import type { DriverId } from "./roster";

export interface Profile {
  /** 0..1: how well they drive overall. */
  skill: number;
  /** Chance they drift a bend that wants it. */
  drift: number;
  /** The share of top speed they hold on straights (1 = flat out). Boosts always run full. */
  pace: number;
  /** The share they hold into a bend (lifting early is the commonest way to lose time). */
  corner: number;
  /** How far ahead they look (units): short = twitchy, late turn-ins. */
  look: number;
  /** How wide a line they wander over (share of the half width). */
  spread: number;
  /** Steering noise (a share of full lock). */
  noise: number;
  /** 0..1: how quickly they use attack items. */
  aggression: number;
  /** When they press gas at the start (steps from GO) and how much that wanders. */
  startMean: number;
  startSd: number;
  /** Chance they steer for an Item Box when they have no item. */
  boxes: number;
  /** Uses items when they'll count; false = whenever, after a while. */
  smart: boolean;
}

export interface Brain {
  rng: number;
  /** The line they're on (units right of the centerline), where it's heading and when it changes. */
  lane: number;
  laneTarget: number;
  laneWait: number;
  noise: number;
  /** This bend's drift call: 1 drift it, -1 don't, 0 not decided. */
  drift: number;
  think: number;
  hold: number;
  patience: number;
  held: string | null;
  /** The Item Box row they last looked at, and whether they're going for a box in it. */
  boxRow: number;
  boxGo: boolean;
  /** The last Oil Slick they noticed, and whether they spotted it in time. */
  seen: number;
  spot: boolean;
  /** Getting unstuck: best progress, steps without gaining, reversing, ask for a tow. */
  best: number;
  stuck: number;
  reverse: number;
  tow: boolean;
  /** The countdown step they press gas. */
  startAt: number;
}

/** Each cast member's lean on top of their stats: a skill nudge and how trigger-happy they are. */
export const CAST_AI: Record<string, { bias: number; aggression: number }> = {
  max: { bias: 0.12, aggression: 0.9 },
  gary: { bias: 0.02, aggression: 0.3 },
  cam: { bias: 0, aggression: 0.6 },
  skip: { bias: 0.1, aggression: 0.5 },
  felix: { bias: -0.02, aggression: 0.4 },
  al: { bias: -0.04, aggression: 1 },
  miles: { bias: 0.06, aggression: 0.5 },
  pip: { bias: -0.02, aggression: 0.7 },
};

/** How difficulty moves every computer racer. */
export const DIFFICULTY: Record<Difficulty, { skill: number; pace: number }> = {
  easy: { skill: -0.15, pace: -0.05 },
  normal: { skill: 0, pace: 0 },
  hard: { skill: 0.12, pace: 0.03 },
};

/** The numbers behind every computer racer (the balance knobs). */
export const AI_TUNING = {
  /** Pace on Normal: base + per skill. */
  paceBase: 0.935,
  pacePerSkill: 0.045,
  /**
   * The speed a computer racer holds is a share of a blend of their own top speed
   * and the field's average: stats still matter (Max is quicker than Felix), but
   * the slowest kart can still win a race now and then.
   */
  paceBlend: 0.4,
  driftBase: 0.2,
  driftPerSkill: 0.65,
  /** Skip, the speedrunner, drifts more. */
  skipDrift: 0.15,
  noiseBase: 0.04,
  noisePerMiss: 0.16,
  /** Cornering: the share of top speed held into bends, base + per skill. */
  cornerBase: 0.88,
  cornerPerSkill: 0.1,
  /** How wide a line they wander over (share of the half width), less with skill. */
  laneSpread: 0.35,
  /** Drifting: start when the road ahead turns at least this much (radians over 240 units)... */
  driftTurn: 0.5,
  /** ...let go once charged and the bend ahead has eased below this... */
  driftExit: 0.3,
  /** ...and a sloppy drifter lets go early this often (per step, times the skill they lack). */
  driftSlip: 0.01,
  /** Steps of steady progress-free driving before they reverse, and before they get towed back on. */
  stuckReverse: 120,
  stuckTow: 420,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A computer racer's skill from their stats and who they are. */
export function skillOf(driver: DriverId, stats: RacerStats): number {
  const bias = CAST_AI[driver]?.bias ?? 0;
  return clamp(0.5 + 0.06 * (stats.handling - 3) + 0.04 * (stats.speed - 3) + 0.02 * (stats.start - 3) + bias, 0.1, 1);
}

export function profileFor(driver: DriverId, stats: RacerStats, difficulty: Difficulty = "normal"): Profile {
  const T = AI_TUNING;
  const d = DIFFICULTY[difficulty];
  const skill = clamp(skillOf(driver, stats) + d.skill, 0.05, 1);
  return {
    skill,
    drift: clamp(T.driftBase + T.driftPerSkill * skill + (driver === "skip" ? T.skipDrift : 0), 0, 0.97),
    pace: clamp(T.paceBase + T.pacePerSkill * skill + d.pace, 0.8, 1),
    corner: clamp(T.cornerBase + T.cornerPerSkill * skill + d.pace, 0.75, 1),
    look: 56,
    spread: T.laneSpread * (1 - 0.4 * skill),
    noise: T.noiseBase + T.noisePerMiss * (1 - skill),
    aggression: CAST_AI[driver]?.aggression ?? 0.5,
    startMean: -2,
    startSd: Math.max(3, 16 - 2 * stats.start),
    boxes: 0.4 + 0.5 * skill,
    smart: true,
  };
}

/** A player who drives well: drifts every bend, flat out, items used well, nearly always a perfect start. */
export const PLAYER_GOOD: Profile = { skill: 1, drift: 0.97, pace: 1, corner: 1, look: 56, spread: 0.15, noise: 0, aggression: 0.8, startMean: -2, startSd: 3, boxes: 0.9, smart: true };

/** A player who doesn't: no drifting, a wobbly line, items used whenever, the start mostly missed. */
export const PLAYER_SLOPPY: Profile = { skill: 0.15, drift: 0, pace: 1, corner: 0.86, look: 40, spread: 0.7, noise: 0.35, aggression: 0.3, startMean: -50, startSd: 60, boxes: 0.2, smart: false };

function gauss(b: { rng: number }): number {
  // Sum of three uniforms: close enough to a bell, and cheap.
  return (draw(b) + draw(b) + draw(b) - 1.5) * 2;
}

export function newBrain(seed: number, profile: Profile): Brain {
  const b: Brain = {
    rng: seed >>> 0,
    lane: 0,
    laneTarget: 0,
    laneWait: 0,
    noise: 0,
    drift: 0,
    think: 0,
    hold: 0,
    patience: 0,
    held: null,
    boxRow: -1,
    boxGo: false,
    seen: -1,
    spot: false,
    best: -1e9,
    stuck: 0,
    reverse: 0,
    tow: false,
    startAt: 0,
  };
  b.startAt = Math.round(profile.startMean + gauss(b) * profile.startSd);
  return b;
}

function aheadDist(s: number, from: number, L: number): number {
  return (((s - from) % L) + L) % L;
}

/** Whether to press the item button this step. */
function wantsItem(gp: GrandPrix, i: number, b: Brain, p: Profile): boolean {
  const rd = gp.riders[i];
  if (!rd.item || rd.roll > 0 || rd.spin > 0) {
    b.held = rd.item;
    b.hold = 0;
    return false;
  }
  if (b.held !== rd.item) {
    b.held = rd.item;
    b.hold = 0;
    b.patience = 30 + Math.floor(draw(b) * 210);
  }
  b.hold++;
  if (b.think > 0) {
    b.think--;
    return false;
  }
  b.think = 5 + Math.floor(draw(b) * 12 * (1.2 - p.aggression));
  if (!p.smart) return b.hold > b.patience;

  const race = gp.race;
  const k = race.racers[i].kart;
  const ahead = aheadOf(gp, i);
  const gapAhead = ahead >= 0 ? gp.riders[ahead].prog - rd.prog : Infinity;
  switch (rd.item) {
    case "shield":
      return false;
    case "coffee":
    case "energy-drink": {
      if (k.boost > 0 || !k.grounded) return false;
      if (k.surface === "grass") return true;
      return bendAhead(race.track, rd.s) < 0.45 && k.speed > rd.eff.top * 0.6 ? true : b.hold > 480;
    }
    case "oil-slick": {
      // Dropped on someone close behind, or in the way of a Homing Missile coming for them.
      if (gp.shots.some((s) => s.kind === "homing-missile" && s.target === i && rd.prog - s.prog < 260 && rd.prog - s.prog > 0)) return true;
      // Not on top of them (it lands under both): a little way back, roughly in line.
      const back = behindOf(gp, i);
      if (back >= 0) {
        const o = gp.riders[back];
        const gap = rd.prog - o.prog;
        if (gap > 120 && gap < 260 && Math.abs(o.lat - rd.lat) < 30) return true;
      }
      return b.hold > 900;
    }
    case "homing-missile":
      return gapAhead < 700 || (ahead < 0 && b.hold > 600);
    case "dart-blaster": {
      const fx = Math.cos(k.h);
      const fy = Math.sin(k.h);
      for (let j = 0; j < gp.riders.length; j++) {
        if (j === i || race.racers[j].finishAt !== null) continue;
        const o = race.racers[j].kart;
        const dx = o.x - k.x;
        const dy = o.y - k.y;
        const along = dx * fx + dy * fy;
        if (along < 30 || along > 380) continue;
        if (Math.abs(dx * fy - dy * fx) < 10 + along * 0.05) return true;
      }
      return b.hold > 600;
    }
    case "heat-seeker":
      return b.hold > 30;
    case "shockwave":
      return rd.place >= 3 || (rd.place >= 2 && b.hold > 300);
    case "smoke-bomb":
      return gapAhead < 450 || (ahead >= 0 && b.hold > 600);
  }
  return false;
}

/**
 * One step of driving for racer i: steering, gas, drift and the item button.
 * Reads the race and changes only the Brain.
 */
export function aiDrive(gp: GrandPrix, i: number, b: Brain, p: Profile): GpInput {
  const race = gp.race;
  const track = race.track;
  const r = race.racers[i];
  const rd = gp.riders[i];
  const k = r.kart;
  if (race.tick < 0) return { steer: 0, gas: race.tick >= b.startAt, brake: false, drift: false, assist: false, item: false };
  const finished = r.finishAt !== null;
  const L = trackGeo(track).L;
  const hw = halfWidthAt(track, rd.s);
  const smoke = rd.smoke > 0;

  // The line: wander between lines, go for a box, steer round slicks and the kart ahead.
  if (--b.laneWait <= 0) {
    b.laneTarget = (draw(b) * 2 - 1) * hw * p.spread;
    b.laneWait = 80 + Math.floor(draw(b) * 160);
  }
  let target = b.laneTarget;
  if (!finished && rd.item === null) {
    let row = -1;
    let rowGap = Infinity;
    for (const box of gp.boxes) {
      const g = aheadDist(box.s, rd.s, L);
      if (g < 280 && g < rowGap) {
        rowGap = g;
        row = box.row;
      }
    }
    if (row >= 0) {
      if (b.boxRow !== row) {
        b.boxRow = row;
        b.boxGo = draw(b) < p.boxes;
      }
      if (b.boxGo) {
        let best = Infinity;
        for (const box of gp.boxes) {
          if (box.row !== row || box.back > 0) continue;
          const d = Math.abs(box.lat - b.lane);
          if (d < best) {
            best = d;
            target = box.lat;
          }
        }
      }
    }
  }
  for (let j = 0; j < gp.riders.length; j++) {
    if (j === i || race.racers[j].finishAt !== null) continue;
    const o = gp.riders[j];
    const g = o.prog - rd.prog;
    if (g <= 0 || g > 70 || Math.abs(o.lat - b.lane) > 18) continue;
    target = o.lat + (o.lat > 0 ? -26 : 26);
  }
  const room = Math.max(0, hw - 18);
  // Oil Slicks ahead come first: whether they spot one is decided once per slick
  // (skill), then they pass it on whichever side has room.
  let dodging = false;
  for (const sl of gp.slicks) {
    const g = aheadDist(sl.s, rd.s, L);
    if (g > 300) continue;
    const clear = sl.r + TUNING.kartRadius + 6;
    if (Math.abs(sl.lat - rd.lat) > clear && Math.abs(sl.lat - b.lane) > clear) continue;
    if (b.seen !== sl.id) {
      b.seen = sl.id;
      b.spot = draw(b) < 0.25 + 0.65 * p.skill;
    }
    if (!b.spot) continue;
    const left = sl.lat - clear - 4;
    const right = sl.lat + clear + 4;
    const okLeft = left >= -room;
    const okRight = right <= room;
    target = okLeft && (!okRight || Math.abs(left - rd.lat) <= Math.abs(right - rd.lat)) ? left : okRight ? right : target;
    dodging = true;
  }
  target = clamp(target, -room, room);
  const move = (dodging ? 200 : 90) * (1 / 60);
  b.lane += clamp(target - b.lane, -move, move);

  // Steering: the autopilot's line (with their own offset), plus their wobble.
  const a = autopilot(track, k, { look: smoke ? 28 : dodging ? 30 : p.look, gain: dodging ? 1.6 : 1, offset: b.lane, near: rd.near });
  b.noise = b.noise * 0.95 + (draw(b) - 0.5) * 0.12;
  const amp = p.noise + (smoke ? 0.35 : 0);
  let steer = clamp(a.steer + b.noise * amp * 3, -1, 1);

  // Drifting: into a bend that turns enough, steering the drift to hold the line,
  // and letting go on the way out once the sparks are charged.
  const T = AI_TUNING;
  const turn = turnAhead(track, rd.s);
  let drift = false;
  const canDrift = p.drift > 0 && !smoke && !finished && rd.spin === 0;
  if (k.drift === 0) {
    if (Math.abs(turn) < T.driftTurn * 0.5) b.drift = 0;
    if (canDrift && k.grounded && k.speed > 160 && Math.abs(turn) > T.driftTurn && steer * turn > 0) {
      if (b.drift === 0) b.drift = draw(b) < p.drift ? 1 : -1;
      if (b.drift > 0) {
        drift = true;
        steer = Math.sign(turn) * Math.max(Math.abs(steer), 0.5);
      }
    }
  } else if (canDrift) {
    const dir = k.drift;
    const ahead = turn * dir;
    drift = true;
    if (ahead < -0.1 || (k.tier > 0 && ahead < T.driftExit) || (k.tier === 2 && ahead < T.driftTurn)) drift = false;
    // A drift always turns its own way: let go once the line needs less than it gives, or off the road.
    if (steer * dir < 0.12 || k.surface === "grass") drift = false;
    if (draw(b) < (1 - p.skill) * T.driftSlip) drift = false;
    if (drift) steer = dir * clamp((steer * dir - TUNING.driftBase) / TUNING.driftRange, -1, 1);
  }

  // Pace: lift off above the speed they hold (never during a boost), less into bends.
  let gas = a.gas;
  const cornering = Math.abs(turn) > 0.6 && !drift;
  const hold = (smoke ? p.pace - 0.08 : p.pace) * (cornering ? p.corner : 1);
  if (gas && hold < 1 && k.boost <= 0) {
    let fieldTop = 0;
    for (const o of gp.riders) fieldTop += o.base.top;
    fieldTop /= gp.riders.length;
    const ref = rd.human ? rd.eff.top : rd.eff.top * (1 - T.paceBlend) + fieldTop * (rd.eff.top / rd.base.top) * T.paceBlend;
    if (k.speed > Math.min(rd.eff.top, ref) * hold) gas = false;
  }
  let brake = a.brake;
  // A late starter hasn't pressed gas yet.
  if (race.tick < b.startAt) gas = false;

  // Unsticking.
  if (finished || rd.spin > 0) b.stuck = 0;
  else if (rd.prog > b.best + 2) {
    b.best = rd.prog;
    b.stuck = 0;
  } else b.stuck++;
  if (b.stuck > AI_TUNING.stuckReverse && b.reverse === 0 && b.stuck % AI_TUNING.stuckReverse === 1) b.reverse = 50;
  if (b.stuck > AI_TUNING.stuckTow) {
    b.tow = true;
    b.stuck = 0;
    b.best = rd.prog;
  }
  if (b.reverse > 0) {
    b.reverse--;
    steer = rd.lat > 0 ? 1 : -1;
    gas = false;
    brake = true;
  }

  const item = !finished && wantsItem(gp, i, b, p);
  return { steer, gas, brake, drift, assist: false, item };
}

/**
 * A stand-in for you in headless checks: drives racer 0 with a player profile.
 * Its Brain lives here, outside the race, so the race still replays from its
 * input log alone.
 */
export function createPlayerBot(profile: Profile, seed: number): { brain: Brain; input: (gp: GrandPrix) => GpInput } {
  const brain = newBrain(seed, profile);
  return { brain, input: (gp) => aiDrive(gp, 0, brain, profile) };
}
