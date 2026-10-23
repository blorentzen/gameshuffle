/**
 * Trainer Road: what its pages receive (types only, client-safe). Store: roadStore.ts.
 *
 * API (src/app/api/trainer-road):
 *   GET  /api/trainer-road?team=<trainer id>         → RoadTeamHome (asks for the duel to be built when it isn't yet)
 *   POST /api/trainer-road { action: "start", team, level } → { run } (409 hard_off, 503 not_ready)
 *   GET  /api/trainer-road/<run id>                  → { run }
 *   POST /api/trainer-road/<run id> { next } | { bring } | { attach, act, use? } → { run }
 *   POST /api/trainer-road/<run id> { action: "tip" } → { hint } (ends this run's solo bonus)
 * Guests send the dailies' guest id in `x-daily-guest`.
 */

import type { DuelRules, DuelTier } from "./types";
import type { DuelCardView, DuelRunView, DuelTrainerView } from "./view";

/** An account's best run on a duel this month. */
export interface RoadBest {
  score: number;
  stars: number;
  turns: number;
  seconds: number | null;
  level: "normal" | "hard";
  won: boolean;
}

export interface RoadBoardRow {
  place: number;
  name: string;
  avatar: string | null;
  profile: string | null;
  score: number;
  stars: number;
  turns: number;
  seconds: number | null;
  /** The best run was in Hard. */
  hard: boolean;
  won: boolean;
  you: boolean;
}

export interface RoadTeamHome {
  trainerId: string;
  /** The month this duel belongs to ("2026-10-01"). */
  month: string;
  game: string;
  /** The game without "Pokémon" ("FireRed and LeafGreen"). */
  gameLabel: string;
  title: string;
  tier: DuelTier;
  tierLabel: string;
  /** False while this month's duel is still being built. */
  ready: boolean;
  trainer: DuelTrainerView | null;
  pack: DuelCardView[];
  team: DuelCardView[];
  bring: number;
  rules: DuelRules;
  /** Hard for this duel: `par` once you've finished a Hard run. */
  hard: { can: boolean; par: number | null };
  /** Normal's par, once you've finished a Normal run. */
  par: number | null;
  best: RoadBest | null;
  /** A duel in progress to pick back up. */
  current: DuelRunView | null;
  board: RoadBoardRow[];
  /** Your row when it's below the top of the board. */
  you: RoadBoardRow | null;
  players: number;
  signedIn: boolean;
}

/** A finished Trainer Road run: the stars it earned, and whether it's now your best this month. */
export type RoadRunView = DuelRunView & { stars?: number | null; best?: boolean };
