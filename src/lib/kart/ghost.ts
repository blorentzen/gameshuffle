/**
 * Ghosts (pure, client-safe): a finished race kept as poses (to draw) and
 * inputs (to check). Poses are every other step, rounded to small integers
 * (1/8 of a unit across the track), packed as base64; the ghost replays them
 * at the same fixed step the race ran at. Inputs are every step, run-length
 * packed, so the run can be played again through the physics later (daily
 * race boards will check times this way).
 */

import type { KartStats } from "./physics";
import { createRace, raceStep, unpackInput, type Race } from "./race";
import type { Track } from "./track";

export const GHOST_VERSION = 1;
/** Keep every second pose. */
export const GHOST_EVERY = 2;

const XY = 8;
const Z = 16;
const H = 32767 / Math.PI;

export interface GhostData {
  v: number;
  /** Track key (mirrored tracks have their own). */
  track: string;
  /** The kart it was set in (rollKey). */
  kart: string;
  totalMs: number;
  lapMs: number[];
  /** Gate milestones in steps (index 0 unused). */
  splits: number[];
  every: number;
  /** Step of the last pose (the finish). */
  last: number;
  /** base64 of int16 groups: x, y, z, heading, flags. */
  frames: string;
  /** Run-length packed inputs, one per step. */
  inputs: string;
}

export interface GhostPose { x: number; y: number; z: number; h: number; flags: number }

export interface Ghost {
  data: GhostData;
  frames: Int16Array;
  count: number;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function wrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** One pose as the ghost stores it. */
export function quantizePose(x: number, y: number, z: number, h: number, flags: number): [number, number, number, number, number] {
  return [Math.round(x * XY), Math.round(y * XY), Math.round(z * Z), Math.round(wrap(h) * H), flags | 0];
}

export function encodeInputs(inputs: number[]): string {
  const runs: string[] = [];
  let i = 0;
  while (i < inputs.length) {
    let j = i + 1;
    while (j < inputs.length && inputs[j] === inputs[i]) j++;
    runs.push(`${(j - i).toString(36)}*${inputs[i].toString(36)}`);
    i = j;
  }
  return runs.join(".");
}

export function decodeInputs(s: string): number[] {
  const out: number[] = [];
  if (!s) return out;
  for (const run of s.split(".")) {
    const [n, v] = run.split("*");
    const count = parseInt(n, 36);
    const value = parseInt(v, 36);
    if (!Number.isFinite(count) || !Number.isFinite(value)) continue;
    for (let k = 0; k < count; k++) out.push(value);
  }
  return out;
}

/** A racer's finished race as a ghost (racer 0, you, by default), or null if they didn't finish. */
export function makeGhost(race: Race, kart: string, racerIndex = 0): GhostData | null {
  const racer = race.racers[racerIndex];
  if (!racer || racer.finishAt === null) return null;
  const count = racer.poses.length / 5;
  const last = count - 1;
  const picks: number[] = [];
  for (let j = 0; j < last; j += GHOST_EVERY) picks.push(j);
  picks.push(last);
  const arr = new Int16Array(picks.length * 5);
  picks.forEach((j, n) => {
    const p = racer.poses;
    const q = quantizePose(p[j * 5], p[j * 5 + 1], p[j * 5 + 2], p[j * 5 + 3], p[j * 5 + 4]);
    arr.set(q, n * 5);
  });
  return {
    v: GHOST_VERSION,
    track: race.track.key,
    kart,
    totalMs: Math.round(racer.finishAt * (1000 / 60)),
    lapMs: racer.lapTimes.map((t) => Math.round(t * (1000 / 60))),
    splits: Array.from(racer.splits, (t) => (t === undefined || t === null ? 0 : Math.round(t * 1000) / 1000)),
    every: GHOST_EVERY,
    last,
    frames: toBase64(new Uint8Array(arr.buffer)),
    inputs: encodeInputs(racer.inputs),
  };
}

export function loadGhost(data: GhostData): Ghost | null {
  if (!data || data.v !== GHOST_VERSION || typeof data.frames !== "string") return null;
  try {
    const bytes = fromBase64(data.frames);
    const frames = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
    const count = Math.floor(frames.length / 5);
    if (count < 2) return null;
    return { data, frames, count };
  } catch {
    return null;
  }
}

function frameTick(g: Ghost, n: number): number {
  return n >= g.count - 1 ? g.data.last : n * g.data.every;
}

/** Where the ghost is at a time (in steps since GO), smoothly between stored poses. */
export function ghostPose(g: Ghost, t: number, out?: GhostPose): GhostPose {
  const o = out ?? { x: 0, y: 0, z: 0, h: 0, flags: 0 };
  const f = g.frames;
  let a: number;
  let u: number;
  if (t <= 0) {
    a = 0;
    u = 0;
  } else if (t >= g.data.last) {
    a = g.count - 1;
    u = 0;
  } else {
    a = Math.min(g.count - 2, Math.floor(t / g.data.every));
    const t0 = frameTick(g, a);
    const t1 = frameTick(g, a + 1);
    u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  }
  const b = Math.min(g.count - 1, a + 1);
  const ia = a * 5;
  const ib = b * 5;
  o.x = (f[ia] + (f[ib] - f[ia]) * u) / XY;
  o.y = (f[ia + 1] + (f[ib + 1] - f[ia + 1]) * u) / XY;
  o.z = (f[ia + 2] + (f[ib + 2] - f[ia + 2]) * u) / Z;
  const ha = f[ia + 3] / H;
  const hb = f[ib + 3] / H;
  o.h = ha + wrap(hb - ha) * u;
  o.flags = u < 0.5 ? f[ia + 4] : f[ib + 4];
  return o;
}

/** The stored pose at stored frame n (exactly as kept). */
export function ghostFrame(g: Ghost, n: number): [number, number, number, number, number] {
  const i = n * 5;
  return [g.frames[i], g.frames[i + 1], g.frames[i + 2], g.frames[i + 3], g.frames[i + 4]];
}

export function ghostFrameTick(g: Ghost, n: number): number {
  return frameTick(g, n);
}

/** Plays the ghost's inputs through the physics again (checks a run: the same inputs give the same race). */
export function replayInputs(track: Track, stats: KartStats, inputs: number[], laps = track.def.laps): Race {
  const race = createRace(track, stats, laps);
  const idle = unpackInput(100 << 4);
  while (race.tick < 0) raceStep(race, idle);
  for (let i = 0; i < inputs.length && race.racers[0].finishAt === null; i++) raceStep(race, unpackInput(inputs[i]));
  return race;
}
