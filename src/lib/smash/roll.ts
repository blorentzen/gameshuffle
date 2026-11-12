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

/** How many costumes a fighter has: its named colors (Melee: 4 to 6), else Ultimate's 8. */
export const costumeCount = (f: SmashFighter | undefined): number => f?.costumes?.length || 8;

/** "Costume 3 · Blue" where the game names its colors (Melee), else "Costume 3". */
export function costumeLabel(f: SmashFighter | undefined, costume: number): string {
  const color = f?.costumes?.[costume - 1];
  return color ? `Costume ${costume} · ${color}` : `Costume ${costume}`;
}

/** The fighter's art in that costume (Melee has a portrait per costume), or "" when the game has none (Melee's Sheik). */
export function costumeArt(game: SmashGame, f: SmashFighter | undefined, costume: number): string {
  if (!f || !game.artReady) return "";
  const img = f.costumeImgs?.[costume - 1] ?? f.img;
  return img ? `${game.assetBase}${img}` : "";
}

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
    return { name: f.name, costume: 1 + Math.floor(rng() * costumeCount(f)) };
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

/** Competitive: the stage as it is, hazards off. Party: any form, hazards on or off (a game without forms, Melee:
 *  always the stage as it is, `forms` false). */
export function rollStage(pool: SmashStage[], competitive: boolean, rng: Rng = Math.random, forms = true): StageRoll {
  const s = pick(pool, rng)!;
  if (competitive || !forms) return { stageId: s.id, form: "normal", hazards: false };
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

/** The game's competitive ruleset (Melee: 4 stocks, 8 minutes, items off). */
export const competitiveRules = (game?: SmashGame): SmashRules => game?.rules?.competitive ?? COMPETITIVE_RULES;

/** Party rules, from what the game has: Stamina and the Final Smash meter only where the game has them (not Melee). */
export function rollPartyRules(rng: Rng = Math.random, game?: SmashGame): SmashRules {
  const stamina = game?.rules ? game.rules.stamina : true;
  const finalSmash = game?.rules ? game.rules.finalSmash : true;
  const kind = pick(stamina ? (["stock", "stock", "time", "stamina"] as const) : (["stock", "stock", "time"] as const), rng)!;
  const stocks = kind === "time" ? null : pick([1, 2, 3, 4], rng)!;
  const minutes = kind === "time" ? pick([2, 3, 4, 5], rng)! : pick([5, 7], rng)!;
  const items = pick(["off", "low", "medium", "high", "very high"] as const, rng)!;
  // Same draws in the same order as before for Ultimate; a game without Final Smashes ignores the last one.
  const meter = rng() < 0.4;
  return { kind, stocks, minutes, items, finalSmashMeter: finalSmash && meter };
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
