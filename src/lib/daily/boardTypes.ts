/**
 * The Daily leaderboards' shapes as the page receives them (client-safe: the
 * server module src/lib/daily/boards.ts re-exports these).
 */

import type { BoardGame, BoardPeriod } from "@/lib/daily/boardRules";

/** `seconds`: the solve time, from Start to the final guess (null without a Start or before daily-times-m1). */
export interface ScoreResult { points: number; tokens: number; recorded: boolean; seconds?: number | null }

export interface BoardRow {
  place: number;
  name: string;
  /** Where they play from: a guest, a Discord player without an account, or null for an account. */
  tag: "guest" | "discord" | null;
  avatar: string | null;
  /** Their public profile, when they have one. */
  profile: string | null;
  points: number;
  days: number;
  guesses: number;
  /** The day board's solve time (it breaks ties on points); null without one, and on week and month boards. */
  seconds: number | null;
  you: boolean;
  /** The prize this place earns when the period ends (weeks and months). */
  prize: number;
}

export interface BoardView {
  ready: boolean;
  game: BoardGame;
  period: BoardPeriod;
  from: string;
  to: string;
  rows: BoardRow[];
  you: BoardRow | null;
  total: number;
  /** When the prizes are paid (weeks and months). */
  settles: string | null;
}

/** A player's solve times in one game: today's (null until finished, or untimed), their best solved time, and how many solved days have a time. */
export interface SolveTimes { seconds: number | null; fastest: number | null; timed: number }
