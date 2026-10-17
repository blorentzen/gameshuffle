/**
 * Daily leaderboards, the rules (pure, client-safe). Britton's picks,
 * 2026-10-16 (https://claude.ai/artifact/3vjmzwXFmUaGTVdQnuut7r): a board per
 * game (the Daily Shuffle, the Daily Dex) for today, this week and this month;
 * points for every finished game; tokens for every game plus prizes for the
 * top 10 when a week or month ends; ties share a place.
 *
 * Days, weeks (Monday to Sunday) and months are Pacific, like everything
 * site-wide (src/lib/time/gsClock.ts). A period settles two days after it ends:
 * a game can still be finished the day after its puzzle (playableDay), so the
 * last day's results are only complete once that day is over too.
 */

import { gsAddDays, gsWeekday } from "@/lib/time/gsClock";

export type BoardGame = "shuffle" | "dex";
export type BoardPeriod = "day" | "week" | "month";
export const BOARD_GAMES: BoardGame[] = ["shuffle", "dex"];
export const BOARD_PERIODS: BoardPeriod[] = ["day", "week", "month"];

/** Who a score belongs to: an account, a Discord identity with no account, or a guest. */
export type PlayerKind = "u" | "i" | "g";
export const playerKey = (kind: PlayerKind, id: string) => `${kind}:${id}`;
export function parsePlayer(key: string): { kind: PlayerKind; id: string } | null {
  const m = /^([uig]):(.+)$/.exec(key);
  return m ? { kind: m[1] as PlayerKind, id: m[2] } : null;
}

/** Points by the guess that got it: 10, 8, 6, 4, 2 (never below 2 in the main game). */
const SOLVE_POINTS = [10, 8, 6, 4, 2];

/**
 * A finished game's points: 10 for guess 1, 2 fewer for each guess after
 * (2 at the least), 1 for a last-chance save, 0 for a miss.
 */
export function pointsFor(guesses: number, solved: boolean, main: number): number {
  if (!solved || guesses < 1) return 0;
  if (guesses > main) return 1;
  return SOLVE_POINTS[guesses - 1] ?? 2;
}

/** The days a period covers, for a day inside it. */
export function periodRange(period: BoardPeriod, day: string): { from: string; to: string } {
  if (period === "day") return { from: day, to: day };
  if (period === "week") {
    const from = gsAddDays(day, -((gsWeekday(day) + 6) % 7));
    return { from, to: gsAddDays(from, 6) };
  }
  const from = `${day.slice(0, 8)}01`;
  const next = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { from, to: gsAddDays(next, -1) };
}

/** The day a period's prizes are paid: two days after its last day. */
export function settlesOn(period: Exclude<BoardPeriod, "day">, start: string): string {
  return gsAddDays(periodRange(period, start).to, 2);
}

/** Levers for the payouts (gs_economy_config), with the defaults the migration seeds. */
export interface BoardLevers {
  tokensPerPoint: number;
  places: number;
  week: [number, number, number, number];
  month: [number, number, number, number];
  holdDays: number;
}
export const DEFAULT_LEVERS: BoardLevers = {
  tokensPerPoint: 5,
  places: 10,
  week: [500, 300, 200, 100],
  month: [2500, 1500, 1000, 250],
  holdDays: 30,
};

/** The prize for a place (1st, 2nd, 3rd, then the rest up to `places`), 0 past it. */
export function prizeFor(place: number, period: Exclude<BoardPeriod, "day">, levers: BoardLevers): number {
  if (place < 1 || place > levers.places) return 0;
  const table = levers[period];
  return table[Math.min(place, 4) - 1] ?? 0;
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** What a period is called on the board's tabs and in messages. */
export const PERIOD_LABEL: Record<BoardPeriod, string> = { day: "Today", week: "This week", month: "This month" };
export const GAME_LABEL: Record<BoardGame, string> = { shuffle: "The Daily Shuffle", dex: "The Daily Dex" };

/** A guest's board name: 2 to 24 characters, spaces tidied. Word and brand checks happen on the server. */
export function tidyName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 24) : "";
}
