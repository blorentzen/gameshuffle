/**
 * The Daily leaderboards' shapes as the page receives them (client-safe: the
 * server module src/lib/daily/boards.ts re-exports these).
 */

import type { BoardGame, BoardPeriod } from "@/lib/daily/boardRules";

export interface ScoreResult { points: number; tokens: number; recorded: boolean }

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
