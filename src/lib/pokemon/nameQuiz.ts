/**
 * Name every Pokémon (search pages round, picks 2026-10-20): type as many of
 * the 1,025 as you can against the clock (15 minutes for all of them, 8 for
 * Gen 1, scaled for the other generations; 30 minutes and no limit as
 * choices). Pure and client-safe.
 *
 * Typing: a name counts the moment it's spelled right (case, accents and
 * punctuation don't matter: "mr mime", "farfetchd", "flabebe"). On Enter, a
 * close spelling counts too when it can only mean one Pokémon (the same
 * matcher as the dailies and Roster Rush). "Nidoran" names whichever Nidoran
 * is still missing. Names only, never art (the Pokémon imagery rule).
 */

import { nameMatcher, tidy } from "@/lib/break/games/names";
import { ALL_POKEMON, GEN_REGIONS, GENERATIONS, type GenPokemon } from "./generator";

export type QuizSet = "all" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type QuizClock = "standard" | "long" | "none";

export const QUIZ_SETS: QuizSet[] = ["all", ...GENERATIONS.map((g) => String(g) as QuizSet)];
export const QUIZ_CLOCKS: QuizClock[] = ["standard", "long", "none"];

export const isQuizSet = (x: unknown): x is QuizSet => typeof x === "string" && (QUIZ_SETS as string[]).includes(x);
export const isQuizClock = (x: unknown): x is QuizClock => x === "standard" || x === "long" || x === "none";

export function setPool(set: QuizSet): GenPokemon[] {
  return set === "all" ? ALL_POKEMON : ALL_POKEMON.filter((p) => p.gen === Number(set));
}

/** "All 1,025 Pokémon", "Gen 1 · Kanto". */
export function setLabel(set: QuizSet): string {
  if (set === "all") return `All ${ALL_POKEMON.length.toLocaleString("en-US")} Pokémon`;
  const region = GEN_REGIONS[Number(set)];
  return `Gen ${set}${region ? ` · ${region}` : ""}`;
}

/** Minutes on the standard clock: 15 for everyone, 8 for Gen 1's 151, the same pace for the others. */
export function standardMinutes(set: QuizSet): number {
  if (set === "all") return 15;
  return Math.max(3, Math.round((setPool(set).length / 151) * 8));
}

export function clockSeconds(set: QuizSet, clock: QuizClock): number | null {
  if (clock === "none") return null;
  return standardMinutes(set) * 60 * (clock === "long" ? 2 : 1);
}

export function clockLabel(set: QuizSet, clock: QuizClock): string {
  const s = clockSeconds(set, clock);
  return s == null ? "No time limit" : `${s / 60} minutes`;
}

// ── Matching ─────────────────────────────────────────────────────────────────

const NIDORAN_F = 29, NIDORAN_M = 32;
const compact = (s: string) => s.replace(/ /g, "");

/** Other ways people type a name, tidied → dex numbers. */
const EXTRA: Record<string, number[]> = {
  nidoran: [NIDORAN_F, NIDORAN_M],
  "nidoran f": [NIDORAN_F], "nidoran female": [NIDORAN_F], "female nidoran": [NIDORAN_F], "nidoran girl": [NIDORAN_F],
  "nidoran m": [NIDORAN_M], "nidoran male": [NIDORAN_M], "male nidoran": [NIDORAN_M], "nidoran boy": [NIDORAN_M],
  "mister mime": [122], "mime junior": [439], "mister rime": [866], "porygon two": [233],
};

export interface QuizMatcher {
  /** Spelled right: the Pokémon it names (two for "Nidoran"), else null. Checked as you type. */
  exact: (raw: string) => number[] | null;
  /** Spelled right or close enough to mean only one Pokémon. Checked on Enter. */
  loose: (raw: string) => number[] | null;
}

export function quizMatcher(): QuizMatcher {
  const exact = new Map<string, number[]>();
  const add = (key: string, dex: number[]) => {
    const k = tidy(key);
    if (!k) return;
    if (!exact.has(k)) exact.set(k, dex);
    if (!exact.has(compact(k))) exact.set(compact(k), dex);
  };
  for (const [k, dex] of Object.entries(EXTRA)) add(k, dex);
  for (const p of ALL_POKEMON) add(p.name, [p.dex]);
  // The fuzzy matcher keys names by their tidied form, so the Nidorans get words of their own.
  const fuzzyName = (p: GenPokemon) => (p.dex === NIDORAN_F ? "Nidoran Female" : p.dex === NIDORAN_M ? "Nidoran Male" : p.name);
  const byName = new Map(ALL_POKEMON.map((p) => [fuzzyName(p), p.dex]));
  const fuzzy = nameMatcher([...byName.keys()], { words: false });
  const look = (raw: string) => {
    const t = tidy(raw);
    return t ? exact.get(t) ?? exact.get(compact(t)) ?? null : null;
  };
  return {
    exact: look,
    loose: (raw) => {
      const hit = look(raw);
      if (hit) return hit;
      const name = fuzzy.match(raw);
      return name ? [byName.get(name)!] : null;
    },
  };
}

// ── The game ─────────────────────────────────────────────────────────────────

export interface QuizGame {
  set: QuizSet;
  clock: QuizClock;
  startedAt: number;
  /** Dex numbers in the order they were named. */
  named: number[];
  endedAt: number | null;
  reason: "time" | "gave-up" | "done" | null;
}

export type NameResult =
  | { kind: "named"; dex: number }
  | { kind: "already"; dex: number }
  | { kind: "other-set"; dex: number }
  | { kind: "unknown" };

export function newGame(set: QuizSet, clock: QuizClock, now = Date.now()): QuizGame {
  return { set, clock, startedAt: now, named: [], endedAt: null, reason: null };
}

/** Names one of the candidates: the first still missing from this set. */
export function nameIt(game: QuizGame, candidates: number[] | null): { game: QuizGame; result: NameResult } {
  if (!candidates?.length) return { game, result: { kind: "unknown" } };
  const pool = new Set(setPool(game.set).map((p) => p.dex));
  const inSet = candidates.filter((d) => pool.has(d));
  if (!inSet.length) return { game, result: { kind: "other-set", dex: candidates[0] } };
  const fresh = inSet.find((d) => !game.named.includes(d));
  if (fresh == null) return { game, result: { kind: "already", dex: inSet[0] } };
  const named = [...game.named, fresh];
  const done = named.length >= pool.size;
  return { game: { ...game, named, ...(done ? { endedAt: Date.now(), reason: "done" as const } : {}) }, result: { kind: "named", dex: fresh } };
}

/** Seconds left (null with no limit), never below zero. */
export function secondsLeft(game: QuizGame, now = Date.now()): number | null {
  const limit = clockSeconds(game.set, game.clock);
  if (limit == null) return null;
  const at = game.endedAt ?? now;
  return Math.max(0, limit - Math.floor((at - game.startedAt) / 1000));
}

/** Seconds played, capped at the clock. */
export function secondsUsed(game: QuizGame, now = Date.now()): number {
  const limit = clockSeconds(game.set, game.clock);
  const used = Math.floor(((game.endedAt ?? now) - game.startedAt) / 1000);
  return limit == null ? Math.max(0, used) : Math.min(limit, Math.max(0, used));
}

/** Ends the game (time's up, or given up). */
export function endGame(game: QuizGame, reason: "time" | "gave-up", now = Date.now()): QuizGame {
  if (game.endedAt) return game;
  const limit = clockSeconds(game.set, game.clock);
  const end = reason === "time" && limit != null ? game.startedAt + limit * 1000 : now;
  return { ...game, endedAt: end, reason };
}

export function clockText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** How many named per generation, for the board's headings. */
export function namedByGen(game: QuizGame): Map<number, number> {
  const out = new Map<number, number>();
  const gen = new Map(ALL_POKEMON.map((p) => [p.dex, p.gen]));
  for (const d of game.named) out.set(gen.get(d)!, (out.get(gen.get(d)!) ?? 0) + 1);
  return out;
}

/** A saved game, checked (from this browser's storage). */
export function readGame(raw: unknown): QuizGame | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<QuizGame>;
  if (!isQuizSet(g.set) || !isQuizClock(g.clock) || typeof g.startedAt !== "number" || !Array.isArray(g.named)) return null;
  const pool = new Set(setPool(g.set).map((p) => p.dex));
  const named = [...new Set(g.named.filter((d): d is number => typeof d === "number" && pool.has(d)))];
  const reason = g.reason === "time" || g.reason === "gave-up" || g.reason === "done" ? g.reason : null;
  return { set: g.set, clock: g.clock, startedAt: g.startedAt, named, endedAt: typeof g.endedAt === "number" ? g.endedAt : null, reason: g.endedAt ? reason : null };
}

/**
 * "Mew" is the start of "Mewtwo", "Porygon" of "Porygon2", "Klink" of
 * "Klinklang": when what's typed names one Pokémon but could still become
 * another one that's missing, the game waits a moment before counting it.
 */
export function waitsForMore(raw: string, game: QuizGame): boolean {
  const typed = compact(tidy(raw));
  if (!typed) return false;
  return setPool(game.set).some((p) => {
    if (game.named.includes(p.dex)) return false;
    const key = compact(tidy(p.name));
    return key.length > typed.length && key.startsWith(typed);
  });
}
