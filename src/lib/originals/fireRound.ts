/**
 * Fire Round: solo trivia against the clock (pure, client-safe). Britton's
 * picks, 2026-10-19 (https://claude.ai/artifact/N8ZZzJUvEkJcBf3J3eEeDT, every
 * answer as recommended): pick a category and a length, type the answer for
 * 100 or open four choices for 40, a run of right answers heats the score up,
 * and Today's Fire Round (60 seconds, mixed, the same questions for everyone)
 * counts on the daily leaderboards. His note: a daily round to compete on
 * every day, and standard rounds to play any time, for retention.
 *
 * The server (src/lib/fireRound/store.ts) holds the clock and the answers and
 * judges every answer with these rules; the page only shows them.
 */

import { normalize } from "@/lib/chatbrain/rules";
import { gsAddDays } from "@/lib/time/gsClock";

/** Today's Fire Round #1. Days count from here, Pacific. */
export const FIRE_EPOCH = "2026-10-20";

export type FireLength = "sprint" | "three" | "five" | "lives";
export const LENGTHS: Record<FireLength, { label: string; short: string; seconds: number | null }> = {
  sprint: { label: "1 minute", short: "1 min", seconds: 60 },
  three: { label: "3 minutes", short: "3 min", seconds: 180 },
  five: { label: "5 minutes", short: "5 min", seconds: 300 },
  lives: { label: "Until 3 misses", short: "3 misses", seconds: null },
};
export const LENGTH_ORDER: FireLength[] = ["sprint", "three", "five", "lives"];
export const isFireLength = (x: unknown): x is FireLength => typeof x === "string" && x in LENGTHS;

/** Today's round is always a 1-minute mixed sprint. */
export const DAILY_LENGTH: FireLength = "sprint";

export const TYPED_POINTS = 100;
export const CHOICE_POINTS = 40;
export const LIVES = 3;
/** An answer sent this long after the clock (a slow network) still counts. */
export const GRACE_MS = 2500;
/**
 * How many questions Today's Fire Round holds: more than anyone gets through
 * in a minute, even tapping choices or skipping as fast as they can
 * (Britton, 2026-10-19: one minute, with enough to fill a speedrun).
 */
export const DAILY_SET_SIZE = 60;
/**
 * The part of a day's set most players reach. Only these count as used when
 * later days' sets are picked, so the long tail a speedrunner sees doesn't
 * use up the pool.
 */
export const DAILY_SEEN = 20;

/**
 * The heat on the next answer, from the right answers in a row before it:
 * ×1, then ×1.5 from 3 in a row, ×2 ("on fire") from 6.
 */
export function heatFor(streak: number): 1 | 1.5 | 2 {
  return streak >= 6 ? 2 : streak >= 3 ? 1.5 : 1;
}

/** Points for one answer: 0 unless right; 100 typed or 40 with choices, times the heat. */
export function pointsFor(right: boolean, withChoices: boolean, streakBefore: number): number {
  if (!right) return 0;
  return Math.round((withChoices ? CHOICE_POINTS : TYPED_POINTS) * heatFor(streakBefore));
}

/**
 * Leaderboard points for today's round, so it sits beside the dailies' 0 to 10:
 * 1 for every 200 scored (rounded up), at most 10.
 */
export function boardPoints(score: number): number {
  if (score <= 0) return 0;
  return Math.min(10, Math.ceil(score / 200));
}

/** Today's round number (#1 on FIRE_EPOCH); 0 before it. */
export function fireNumber(day: string): number {
  if (day < FIRE_EPOCH) return 0;
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${FIRE_EPOCH}T12:00:00Z`)) / 86_400_000) + 1;
}

/** The day before `day`, Pacific calendar (for streaks). */
export const dayBefore = (day: string) => gsAddDays(day, -1);

// ─── categories ──────────────────────────────────────────────────────────────

/**
 * The categories a round can be about. Pack categories match the question's
 * category; game categories match the game packs' game_slug. A category only
 * shows once it holds MIN_CATEGORY questions that can be played.
 */
export interface FireCategory {
  id: string;
  label: string;
  /** A key into the page's Tabler icon map (never emoji). */
  icon: string;
  /** Pack categories it draws from. */
  categories?: string[];
  /** Game pack slugs it draws from (any game_slug starting with one of these). */
  games?: string[];
}

export const MIXED = "mixed";
export const MIN_CATEGORY = 12;

export const FIRE_CATEGORIES: FireCategory[] = [
  { id: MIXED, label: "Mixed", icon: "shuffle" },
  { id: "general", label: "General knowledge", icon: "bulb", categories: ["General knowledge"] },
  { id: "geography", label: "Geography", icon: "world", categories: ["Geography"] },
  { id: "science", label: "Science & nature", icon: "flask", categories: ["Science & nature"] },
  { id: "history", label: "History", icon: "history", categories: ["History"] },
  { id: "video-games", label: "Video games", icon: "gamepad", categories: ["Video games"] },
  { id: "movies", label: "Movies & TV", icon: "movie", categories: ["Movies & TV"] },
  { id: "music", label: "Music", icon: "music", categories: ["Music"] },
  { id: "sports", label: "Sports", icon: "sports", categories: ["Sports"] },
  { id: "food", label: "Food & drink", icon: "food", categories: ["Food & drink"] },
  { id: "words", label: "Words & numbers", icon: "abc", categories: ["Words & numbers"] },
  { id: "characters", label: "Game characters", icon: "photo", categories: ["Picture: game characters"] },
  { id: "overwatch", label: "Overwatch heroes", icon: "shield", categories: ["Picture: Overwatch heroes"] },
  { id: "mario-kart", label: "Mario Kart", icon: "kart", games: ["mario-kart"] },
  { id: "mario-party", label: "Mario Party", icon: "dice", games: ["mario-party", "super-mario-party"] },
  { id: "smash", label: "Smash Bros.", icon: "sword", games: ["super-smash-bros"] },
  { id: "pokemon", label: "Pokémon", icon: "pokeball", games: ["pokemon"] },
];

export const fireCategory = (id: string | null | undefined) => FIRE_CATEGORIES.find((c) => c.id === id) ?? FIRE_CATEGORIES[0];

/** Does a question belong to a category? Mixed takes everything. */
export function inCategory(cat: FireCategory, q: { category: string | null; gameSlug?: string | null }): boolean {
  if (cat.id === MIXED) return true;
  if (cat.categories?.includes(q.category ?? "")) return true;
  if (cat.games && q.gameSlug) return cat.games.some((g) => q.gameSlug!.startsWith(g));
  return false;
}

// ─── the four choices ────────────────────────────────────────────────────────

/** A small seeded random source (xmur3 + mulberry32), so a question's choices come out the same every time. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (() => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; })();
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The number in an answer ("1,989" → 1989), or null when it isn't a plain number. */
export function answerNumber(answer: string): number | null {
  const t = answer.replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const fmt = (n: number, decimals: number) => (decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-US"));

/**
 * Three believable wrong numbers for a number answer: neighbours for small
 * counts, nearby years for years, and rounded steps of 10 to 30 percent for
 * the rest. Never the answer, never below zero for a count.
 */
export function numberDistractors(answer: string, seed: string): string[] | null {
  const n = answerNumber(answer);
  if (n === null) return null;
  const decimals = (answer.split(".")[1] ?? "").length;
  const rand = seeded(`num:${seed}`);
  const year = Number.isInteger(n) && n >= 1000 && n <= 2100;
  let pool: number[];
  if (year) pool = [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10].map((d) => n + d).filter((y) => y <= 2100);
  else if (Number.isInteger(n) && Math.abs(n) <= 12) pool = [-3, -2, -1, 1, 2, 3, 4].map((d) => n + d).filter((v) => v >= 0);
  else {
    const step = (p: number) => {
      const raw = n * (1 + p);
      if (decimals) return Number(raw.toFixed(decimals));
      const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(raw))) - 1));
      return Math.round(raw / mag) * mag;
    };
    pool = [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.5].map(step).filter((v) => v > 0 || n < 0);
  }
  const unique = [...new Set(pool.filter((v) => v !== n))];
  const picked = shuffled(unique, rand).slice(0, 3);
  return picked.length === 3 ? picked.map((v) => fmt(v, decimals)) : null;
}

/** Three wrong names from a roster (the other answers in a picture category), never the answer or one of its spellings. */
export function rosterDistractors(answer: string, roster: string[], seed: string, also: string[] = []): string[] | null {
  const taken = new Set([answer, ...also].map(normalize));
  const pool = [...new Set(roster)].filter((r) => !taken.has(normalize(r)));
  const picked = shuffled(pool, seeded(`roster:${seed}`)).slice(0, 3);
  return picked.length === 3 ? picked : null;
}

/** The four choices in a fixed order for this question: the answer and three wrong ones. */
export function fourChoices(answer: string, wrong: string[], seed: string): string[] {
  return shuffled([answer, ...wrong.slice(0, 3)], seeded(`choices:${seed}`));
}

/** Does a picked choice match the answer? */
export const choiceIsRight = (choice: string, answer: string) => normalize(choice) === normalize(answer);

/** Wrong answers a person wrote or approved: exactly three, all different, none the answer or one of its accepted spellings. */
export function cleanWrong(wrong: unknown, answer: string, accept: string[] = []): string[] | null {
  if (!Array.isArray(wrong)) return null;
  const taken = new Set([answer, ...accept].map(normalize));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of wrong) {
    if (typeof w !== "string") continue;
    const t = w.trim().replace(/\s+/g, " ").slice(0, 120);
    const k = normalize(t);
    if (!t || taken.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.length >= 3 ? out.slice(0, 3) : null;
}

// ─── results ─────────────────────────────────────────────────────────────────

export interface FireTotals { score: number; right: number; missed: number; skipped: number; choices: number; bestStreak: number }

/** The line "Copy my score" puts on the clipboard. */
export function fireShareText(t: FireTotals, opts: { daily: boolean; number: number; lengthLabel: string; categoryLabel: string; url: string }): string {
  const head = opts.daily && opts.number >= 1 ? `GameShuffle Fire Round #${opts.number}` : `GameShuffle Fire Round · ${opts.categoryLabel}, ${opts.lengthLabel.toLowerCase()}`;
  return `${head}: ${t.score.toLocaleString("en-US")} (${t.right} right, best streak ${t.bestStreak})\n${opts.url}`;
}
