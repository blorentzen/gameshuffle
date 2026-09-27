/**
 * Smash Ultimate on the standard tournament formats. Client-safe and pure;
 * state lives in `tournaments.settings`:
 *
 *   settings.smash        the organizer's rules: best-of, legal stages,
 *                         how fighters and stages are chosen.
 *   settings.smashSets    live sets for 1v1 bracket matches, keyed by match
 *                         id: fighters, strikes, stage and winner per game.
 *   settings.smashRounds  shared rolls for points formats (every flight plays
 *                         the same stage, optionally the same fighters by seat).
 *   settings.crewBattles  crew battles (see ./crew.ts).
 *   settings.missionBonus mission points, shared with Mario Party.
 */

import { ULTIMATE } from "@/data/smash/ultimate";
import { drawFighters, fighterPool, type FighterRoll } from "@/lib/smash/roll";
import type { SmashGame, SmashStage } from "@/lib/smash/types";

export type Side = "a" | "b";

export interface SmashTourneyRules {
  bestOf: 3 | 5;
  /** Best-of for sets the organizer marks as finals. */
  finalsBestOf: 3 | 5;
  /** pick: players choose. random: rolled every game. random_unique: rolled, no repeats within a set. */
  fighters: "pick" | "random" | "random_unique";
  /** strike: game 1 struck from the starters, then the loser counterpicks. random: a legal stage each game. */
  stages: "strike" | "random";
  /** Starter stages (struck for game 1). */
  starters: string[];
  /** Every legal stage, starters included. */
  legal: string[];
}

export function isSmashGame(slug: string | null | undefined): boolean {
  return slug === ULTIMATE.slug;
}

/** FFA points formats score like Mario Party: steep, four to a flight. */
export const SMASH_SCORING_TABLE = [10, 6, 3, 1];
export const SMASH_FLIGHT_SIZE = 4;

export function defaultRules(game: SmashGame = ULTIMATE): SmashTourneyRules {
  const starters = game.stages.filter((s) => s.status === "starter").map((s) => s.id);
  const legal = game.stages.filter((s) => s.status === "starter" || s.status === "counterpick").map((s) => s.id);
  return { bestOf: 3, finalsBestOf: 5, fighters: "pick", stages: "strike", starters, legal };
}

export function readRules(raw: unknown, game: SmashGame = ULTIMATE): SmashTourneyRules {
  const d = defaultRules(game);
  const r = (raw ?? {}) as Partial<SmashTourneyRules>;
  const known = new Set(game.stages.map((s) => s.id));
  const legal = Array.isArray(r.legal) ? r.legal.filter((id) => known.has(id)) : d.legal;
  const starters = Array.isArray(r.starters) ? r.starters.filter((id) => legal.includes(id)) : d.starters.filter((id) => legal.includes(id));
  return {
    bestOf: r.bestOf === 5 ? 5 : 3,
    finalsBestOf: r.finalsBestOf === 3 ? 3 : 5,
    fighters: r.fighters === "random" || r.fighters === "random_unique" ? r.fighters : "pick",
    stages: r.stages === "random" ? "random" : "strike",
    legal: legal.length ? legal : d.legal,
    starters: starters.length ? starters : legal.slice(0, 1),
  };
}

/* ── Sets ────────────────────────────────────────────────────────────────── */

export interface SmashSetGame {
  fighters: { a: FighterRoll | null; b: FighterRoll | null };
  stageId: string | null;
  winner: Side | null;
}
export interface SmashSet {
  matchId: string;
  a: string;
  b: string;
  bestOf: 3 | 5;
  /** Who strikes first for game 1 (the rock-paper-scissors winner). */
  firstStriker: Side;
  /** Starters struck so far for game 1, in order. */
  strikes: string[];
  games: SmashSetGame[];
  reported: boolean;
}

export function newSet(matchId: string, a: string, b: string, bestOf: 3 | 5, firstStriker: Side = "a"): SmashSet {
  return { matchId, a, b, bestOf, firstStriker, strikes: [], games: [], reported: false };
}

export const other = (s: Side): Side => (s === "a" ? "b" : "a");

export function setScore(set: SmashSet): { a: number; b: number } {
  return set.games.reduce((acc, g) => (g.winner ? { ...acc, [g.winner]: acc[g.winner] + 1 } : acc), { a: 0, b: 0 });
}

/** The side that has won the set, once someone reaches a majority. */
export function setWinner(set: SmashSet): Side | null {
  const need = Math.ceil(set.bestOf / 2);
  const s = setScore(set);
  return s.a >= need ? "a" : s.b >= need ? "b" : null;
}

/**
 * Strike order for game 1, relative to the first striker. Five starters is the
 * standard 1-2-1; otherwise players alternate one strike each until one stage
 * is left.
 */
export function strikeSequence(starters: number): ("first" | "second")[] {
  if (starters === 5) return ["first", "second", "second", "first"];
  return Array.from({ length: Math.max(0, starters - 1) }, (_, i) => (i % 2 === 0 ? "first" : "second"));
}

/** Whose strike it is, or null when striking is finished. */
export function nextStriker(set: SmashSet, rules: SmashTourneyRules): Side | null {
  const seq = strikeSequence(rules.starters.length);
  const step = seq[set.strikes.length];
  if (!step) return null;
  return step === "first" ? set.firstStriker : other(set.firstStriker);
}

export function remainingStarters(set: SmashSet, rules: SmashTourneyRules): string[] {
  return rules.starters.filter((id) => !set.strikes.includes(id));
}

/**
 * Stages the loser of the last game may counterpick. Dave's Stupid Rule: a
 * player can't pick a stage they've already won on in this set.
 */
export function counterpickOptions(set: SmashSet, rules: SmashTourneyRules): { picker: Side | null; stages: string[] } {
  const last = [...set.games].reverse().find((g) => g.winner);
  if (!last?.winner) return { picker: null, stages: rules.legal };
  const picker = other(last.winner);
  const wonOn = new Set(set.games.filter((g) => g.winner === picker && g.stageId).map((g) => g.stageId!));
  return { picker, stages: rules.legal.filter((id) => !wonOn.has(id)) };
}

/** A random legal stage, avoiding ones already played in the set where possible. */
export function rollSetStage(set: SmashSet, rules: SmashTourneyRules, rng: () => number = Math.random): string | null {
  const played = new Set(set.games.map((g) => g.stageId).filter(Boolean));
  const fresh = rules.legal.filter((id) => !played.has(id));
  const pool = fresh.length ? fresh : rules.legal;
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/**
 * Fighters for the next game. With random_unique, neither player repeats a
 * fighter within the set (the two may still land the same fighter as each other).
 */
export function rollSetFighters(set: SmashSet, rules: SmashTourneyRules, exclude: string[] = [], game: SmashGame = ULTIMATE): { a: FighterRoll; b: FighterRoll } | null {
  const pool = fighterPool(game, { echoes: "separate", miis: false, series: [], exclude });
  const used = (side: Side) => (rules.fighters === "random_unique" ? set.games.map((g) => g.fighters[side]?.name).filter((n): n is string => !!n) : []);
  const [a] = drawFighters(pool, 1, { used: used("a") });
  const [b] = drawFighters(pool, 1, { used: used("b") });
  return a && b ? { a, b } : null;
}

/* ── Points formats: shared round rolls ─────────────────────────────────── */

export interface SmashRound { round: number; stageId: string; fighters: FighterRoll[]; rolledAt: string }

/** Next round's shared stage (rotating through the legal list) and, if asked, a fighter per seat. */
export function rollSmashRound(previous: SmashRound[], rules: SmashTourneyRules, withFighters: boolean, exclude: string[] = [], game: SmashGame = ULTIMATE): SmashRound | null {
  const used = new Set(previous.map((r) => r.stageId));
  const fresh = rules.legal.filter((id) => !used.has(id));
  const pool = fresh.length ? fresh : rules.legal;
  if (!pool.length) return null;
  const stageId = pool[Math.floor(Math.random() * pool.length)];
  const fighters = withFighters ? drawFighters(fighterPool(game, { echoes: "separate", miis: false, series: [], exclude }), SMASH_FLIGHT_SIZE, { unique: true }) : [];
  return { round: previous.length + 1, stageId, fighters, rolledAt: new Date().toISOString() };
}

export function stageName(id: string | null | undefined, game: SmashGame = ULTIMATE): string {
  return game.stages.find((s) => s.id === id)?.name ?? "No stage yet";
}

export function stageStatusLabel(s: SmashStage): string {
  return s.status === "starter" ? "Starter" : s.status === "counterpick" ? "Counterpick" : s.status === "sometimes" ? "Some events" : "Casual";
}
