/**
 * One Shuffle Kart race (pure, client-safe): the countdown, the fixed-step
 * physics, checkpoint gates in order, laps, sub-step lap and finish times, and
 * the recording a ghost is made from (every input and every pose, per step).
 *
 * A race holds a list of racers. The prototype races one (you, racer 0, with
 * your ghost drawn beside you); computer drivers and live races join the same
 * list later, each with its own inputs per step.
 *
 * Laps only count when every gate is passed in order: gate 0 is the finish
 * line, crossing it backwards takes a gate back, and skipping a gate (cutting
 * across the infield) means the lap never closes until you go back for it.
 */

import { NO_INPUT, startState, stepKart, TUNING, type KartEvents, type KartInput, type KartState, type KartStats } from "./physics";
import { nearest, tangentAngle, type Track } from "./track";

/** Three seconds of countdown before GO. */
export const COUNTDOWN_TICKS = 180;
export const TICK_MS = 1000 * TUNING.dt;

export interface Racer {
  id: string;
  stats: KartStats;
  kart: KartState;
  /** Gates passed in order (backwards crossings take them back). */
  passed: number;
  maxPassed: number;
  /** When each gate milestone was first reached, in steps (with the fraction of the step), by milestone number. */
  splits: number[];
  /** Each finished lap, in steps. */
  lapTimes: number[];
  finishAt: number | null;
  /** One packed input per step from GO to the finish (see packInput). */
  inputs: number[];
  /** Pose per step from GO: x, y, z, heading, flags (see poseFlags). */
  poses: number[];
  /** Steps spent driving the wrong way. */
  wrongWay: number;
}

export interface Race {
  track: Track;
  laps: number;
  /** Steps since GO (negative during the countdown). */
  tick: number;
  racers: Racer[];
}

export interface RacerEvents {
  /** A gate passed for the first time: its milestone number (1 = left the start). */
  split: number;
  /** A lap finished: its number and time in steps. */
  lap: number;
  lapTime: number;
  finish: boolean;
  kart: KartEvents | null;
}

export interface RaceEvents {
  /** Countdown beeps: 3, 2, 1. */
  beep: 0 | 1 | 2 | 3;
  go: boolean;
  /** One per racer, in the race's order. */
  racers: RacerEvents[];
}

export interface Entry { id: string; stats: KartStats }

/** A race for one racer (pass stats) or several (pass entries; the first takes pole). */
export function createRace(track: Track, entries: KartStats | Entry[], laps = track.def.laps): Race {
  const list: Entry[] = Array.isArray(entries) ? entries : [{ id: "you", stats: entries }];
  return {
    track,
    laps,
    tick: -COUNTDOWN_TICKS,
    racers: list.map((e, slot) => {
      const kart = startState(track, slot, list.length);
      return {
        id: e.id,
        stats: e.stats,
        kart,
        passed: 0,
        maxPassed: 0,
        splits: [],
        lapTimes: [],
        finishAt: null,
        inputs: [],
        poses: [kart.x, kart.y, kart.z, kart.h, poseFlags(kart)],
        wrongWay: 0,
      };
    }),
  };
}

/** Racer 0: you. */
export function you(race: Race): Racer {
  return race.racers[0];
}

/** Steer is stored to the hundredth; the physics only ever sees the stored value, so replays match. */
export function quantize(inp: KartInput): KartInput {
  const steer = Math.max(-100, Math.min(100, Math.round((Number.isFinite(inp.steer) ? inp.steer : 0) * 100))) / 100;
  return { steer, gas: !!inp.gas, brake: !!inp.brake, drift: !!inp.drift, assist: !!inp.assist };
}

export function packInput(inp: KartInput): number {
  const steer = Math.round(inp.steer * 100) + 100;
  return (steer << 4) | (inp.gas ? 1 : 0) | (inp.brake ? 2 : 0) | (inp.drift ? 4 : 0) | (inp.assist ? 8 : 0);
}

export function unpackInput(v: number): KartInput {
  return { steer: ((v >> 4) - 100) / 100, gas: !!(v & 1), brake: !!(v & 2), drift: !!(v & 4), assist: !!(v & 8) };
}

/** Drift direction, boost and spark color in one small number (the ghost draws them). */
export function poseFlags(k: KartState): number {
  return (k.drift + 1) | (k.boost > 0 ? 4 : 0) | (k.tier << 3);
}

function crossing(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  // Fraction along a→b where it crosses c→d, or -1.
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/**
 * One racer's step (raceStep calls it for each racer in order). Once a racer has
 * finished they coast with no input, unless `after` is given: races with computer
 * drivers keep everyone driving past the line. Nothing is recorded after the finish.
 */
export function stepRacer(race: Race, r: Racer, input: KartInput | undefined, after?: KartInput): RacerEvents {
  const ev: RacerEvents = { split: 0, lap: 0, lapTime: 0, finish: false, kart: null };
  const racing = r.finishAt === null;
  const inp = racing ? quantize(input ?? NO_INPUT) : after ? quantize(after) : NO_INPUT;
  const k = r.kart;
  const px = k.x;
  const py = k.y;
  ev.kart = stepKart(k, inp, race.track, r.stats);
  if (!racing) return ev;

  const gates = race.track.gates;
  const K = gates.length;
  const mx = k.x - px;
  const my = k.y - py;
  for (const g of gates) {
    const f = crossing(px, py, k.x, k.y, g.x1, g.y1, g.x2, g.y2);
    if (f < 0) continue;
    const forward = mx * g.tx + my * g.ty > 0;
    if (forward && g.index === r.passed % K) {
      r.passed++;
      if (r.passed > r.maxPassed) {
        r.maxPassed = r.passed;
        const at = race.tick + f;
        r.splits[r.passed] = at;
        ev.split = r.passed;
        if (r.passed > 1 && (r.passed - 1) % K === 0) {
          const lap = (r.passed - 1) / K;
          const start = lap === 1 ? 0 : r.splits[1 + (lap - 1) * K];
          r.lapTimes.push(at - start);
          ev.lap = lap;
          ev.lapTime = at - start;
          if (lap >= race.laps) {
            r.finishAt = at;
            ev.finish = true;
          }
        }
      }
    } else if (!forward && r.passed > 0 && g.index === (r.passed - 1) % K) {
      r.passed--;
    }
  }

  // Wrong way: on the road, moving against the track.
  const near = nearest(race.track, k.x, k.y);
  if (near.dist <= near.hw && Math.abs(k.speed) > 30) {
    const a = tangentAngle(race.track, near);
    const along = (k.vx * Math.cos(a) + k.vy * Math.sin(a)) / Math.max(1, Math.hypot(k.vx, k.vy));
    r.wrongWay = along < -0.4 ? r.wrongWay + 1 : 0;
  } else if (r.wrongWay > 0) {
    r.wrongWay = 0;
  }

  r.inputs.push(packInput(inp));
  r.poses.push(k.x, k.y, k.z, k.h, poseFlags(k));
  return ev;
}

/**
 * Advances the race one step. Pass each racer's input (one input for a race of one, or
 * a list in the race's order); inputs are ignored during the countdown and after a racer finishes.
 */
export function raceStep(race: Race, inputs: KartInput | KartInput[]): RaceEvents {
  const ev: RaceEvents = { beep: 0, go: false, racers: [] };
  if (race.tick < 0) {
    if (race.tick === -COUNTDOWN_TICKS) ev.beep = 3;
    else if (race.tick === -120) ev.beep = 2;
    else if (race.tick === -60) ev.beep = 1;
    race.tick++;
    if (race.tick === 0) ev.go = true;
    return ev;
  }
  const list = Array.isArray(inputs) ? inputs : [inputs];
  for (let i = 0; i < race.racers.length; i++) ev.racers.push(stepRacer(race, race.racers[i], list[i]));
  race.tick++;
  return ev;
}

/** Steps to milliseconds. */
export function ticksToMs(ticks: number): number {
  return Math.round(ticks * TICK_MS);
}

/** 1:23.45 */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** +0.42 or −1.10 (seconds), for the ghost split. */
export function formatDelta(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}`;
}
