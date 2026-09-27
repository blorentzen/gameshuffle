/**
 * Pure draws for Smash: fighters, stages, rules, Custom Smash, Squad Strike
 * and a night plan. No React or I/O; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import type { SmashFighter, SmashGame, SmashStage } from "@/lib/smash/types";

/* ── Fighters ────────────────────────────────────────────────────────────── */

export interface FighterOptions {
  /** Echo Fighters: listed on their own, merged into their original (so they can't come up), or left out. */
  echoes: "separate" | "merged";
  miis: boolean;
  /** Limit to these series codes. Empty = all. */
  series?: string[];
  /** Names switched off (the person's collection, DLC they don't own). */
  exclude?: string[];
}

export function fighterPool(game: SmashGame, o: FighterOptions): SmashFighter[] {
  const off = new Set(o.exclude ?? []);
  const rows = game.fighters.filter((f) =>
    !off.has(f.name)
    && (o.miis || !f.mii)
    && (o.echoes === "separate" || !f.echoOf)
    && (!o.series?.length || o.series.includes(f.series)));
  return rows.length ? rows : game.fighters.filter((f) => !f.mii);
}

export interface FighterRoll { name: string; costume: number }

/**
 * A fighter (and costume slot 1-8) for each player. Repeats between players
 * are allowed, like the game, unless `unique`. `used` leaves out fighters
 * already played this night (a Smashdown run).
 */
export function drawFighters(pool: SmashFighter[], players: number, opts: { unique?: boolean; used?: string[] } = {}, rng: Rng = Math.random): FighterRoll[] {
  const used = new Set(opts.used ?? []);
  let fresh = pool.filter((f) => !used.has(f.name));
  if (!fresh.length) fresh = pool;
  const order = shuffle(fresh, rng);
  return Array.from({ length: players }, (_, i) => {
    const f = opts.unique ? order[i % order.length] : pick(fresh, rng)!;
    return { name: f.name, costume: 1 + Math.floor(rng() * 8) };
  });
}

/* ── Stages ──────────────────────────────────────────────────────────────── */

export type StageList = "competitive" | "all" | "custom";
export type StageForm = "normal" | "battlefield" | "omega";

export interface StageOptions {
  list: StageList;
  /** Competitive list: include the stages only some events allow. */
  sometimes: boolean;
  /** Custom list: stage ids. */
  customIds?: string[];
  exclude?: string[];
}

export function stagePool(game: SmashGame, o: StageOptions): SmashStage[] {
  const off = new Set(o.exclude ?? []);
  const rows = game.stages.filter((s) => {
    if (off.has(s.id)) return false;
    if (o.list === "custom") return (o.customIds ?? []).includes(s.id);
    if (o.list === "competitive") return s.status === "starter" || s.status === "counterpick" || (o.sometimes && s.status === "sometimes");
    return true;
  });
  return rows.length ? rows : game.stages.filter((s) => s.status === "starter");
}

export interface StageRoll { stageId: string; form: StageForm; hazards: boolean }

/** Competitive: the stage as it is, hazards off. Party: any form, hazards on or off. */
export function rollStage(pool: SmashStage[], competitive: boolean, rng: Rng = Math.random): StageRoll {
  const s = pick(pool, rng)!;
  if (competitive) return { stageId: s.id, form: "normal", hazards: false };
  const r = rng();
  return { stageId: s.id, form: r < 0.6 ? "normal" : r < 0.8 ? "battlefield" : "omega", hazards: rng() < 0.6 };
}

/* ── Rules ───────────────────────────────────────────────────────────────── */

export interface SmashRules {
  kind: "stock" | "time" | "stamina";
  stocks: number | null;
  minutes: number | null;
  items: "off" | "low" | "medium" | "high" | "very high";
  finalSmashMeter: boolean;
}

/** The common competitive ruleset: 3 stocks, 7 minutes, no items. */
export const COMPETITIVE_RULES: SmashRules = { kind: "stock", stocks: 3, minutes: 7, items: "off", finalSmashMeter: false };

export function rollPartyRules(rng: Rng = Math.random): SmashRules {
  const kind = pick(["stock", "stock", "time", "stamina"] as const, rng)!;
  return {
    kind,
    stocks: kind === "time" ? null : pick([1, 2, 3, 4], rng)!,
    minutes: kind === "time" ? pick([2, 3, 4, 5], rng)! : pick([5, 7], rng)!,
    items: pick(["off", "low", "medium", "high", "very high"] as const, rng)!,
    finalSmashMeter: rng() < 0.4,
  };
}

/* ── Custom Smash ────────────────────────────────────────────────────────── */

/** Two or three conditions changed from Normal; the rest stay Normal. */
export function rollCustomSmash(game: SmashGame, rng: Rng = Math.random): Record<string, string> {
  const changed = new Set(shuffle(game.customSmash.map((o) => o.id), rng).slice(0, 2 + Math.floor(rng() * 2)));
  return Object.fromEntries(game.customSmash.map((o) => [o.id, changed.has(o.id) ? pick(o.values.filter((v) => v !== "Normal"), rng)! : "Normal"]));
}

/* ── Squad Strike ────────────────────────────────────────────────────────── */

/** A squad of `size` different fighters for each player. */
export function drawSquads(pool: SmashFighter[], players: number, size: 3 | 5, rng: Rng = Math.random): string[][] {
  return Array.from({ length: players }, () => shuffle(pool, rng).slice(0, Math.min(size, pool.length)).map((f) => f.name));
}

/* ── Night plan ──────────────────────────────────────────────────────────── */

export interface SmashSegment { modeId: string; option: string | null; minutes: number; matches: number | null }

/**
 * Plan a night: a block of regular Smash matches sized to about half the
 * time, with the other modes around it, each at most once.
 */
export function planSmashNight(game: SmashGame, o: { humans: number; minutes: number; modes?: string[] }, rng: Rng = Math.random): SmashSegment[] {
  const eligible = game.modes.filter((m) => o.humans >= m.minPlayers && o.humans <= m.maxPlayers && (!o.modes?.length || o.modes.includes(m.id)));
  const main = eligible.find((m) => m.id === "smash");
  const segs: SmashSegment[] = [];
  let left = o.minutes;
  if (main) {
    const matches = Math.max(3, Math.round((o.minutes * 0.5) / game.minutesPerMatch));
    segs.push({ modeId: main.id, option: null, minutes: matches * game.minutesPerMatch, matches });
    left -= matches * game.minutesPerMatch;
  }
  for (const m of shuffle(eligible.filter((x) => x.id !== "smash"), rng)) {
    if (m.minutes <= left) { segs.push({ modeId: m.id, option: m.options ? pick(m.options.values, rng) ?? null : null, minutes: m.minutes, matches: null }); left -= m.minutes; }
  }
  return segs;
}
