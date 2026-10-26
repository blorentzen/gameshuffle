/**
 * Trainer Road: what its pages receive (types only, client-safe). Store: roadStore.ts.
 *
 * API (src/app/api/trainer-road):
 *   GET  /api/trainer-road?team=<trainer id>         → RoadTeamHome (asks for the duel to be built when it isn't yet)
 *   POST /api/trainer-road { action: "start", team, level } → { run } (409 hard_off, 503 not_ready)
 *   GET  /api/trainer-road/<run id>                  → { run }
 *   POST /api/trainer-road/<run id> { next } | { bring } | { attach, act, use? } → { run }
 *   POST /api/trainer-road/<run id> { action: "tip" } → { hint } (ends this run's solo bonus)
 *   GET  /api/trainer-road?path=<region>             → { progress: RoadProgressView | null, path: RoadPathView } (progress for accounts;
 *                                                      a region's story battle due on the account's path turns up here)
 *   POST /api/trainer-road/<run id> { tool, card?, type? } → { run } (a tool from the bag during your turn; 409 no_tool)
 *   GET  /api/trainer-road?mart=<region>             → MartView (accounts: the bag, the shelf, the balance)
 *   POST /api/trainer-road { action: "buy", tool, region, nonce } → MartView (402 insufficient_balance, 409 full | shelf)
 *   POST /api/trainer-road { action: "keep", region, tool } → MartView (the tool kept for good in a cleared region)
 * Guests send the dailies' guest id in `x-daily-guest`.
 */

import type { DuelLevel, DuelRules, DuelTier, ToolId } from "./types";
import type { DuelCardView, DuelPicture, DuelRunView, DuelTrainerView, ToolBagView } from "./view";
import type { CardColor, PathKind, PathOutcome, StepState } from "./roadPath";

/** An account's best run on a duel this month. */
export interface RoadBest {
  score: number;
  stars: number;
  turns: number;
  seconds: number | null;
  level: DuelLevel;
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
  /** The best run was in Hard, or in Easy. */
  hard: boolean;
  easy?: boolean;
  /** The best run used a tool (a bag mark beside it). */
  tools?: boolean;
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
  /** Easy for this duel (rules 6 duels on, once the database takes Easy runs). */
  easy: { can: boolean };
  /** Normal's comeback Energy on this duel: 1 on rules 7 duels, up to 2 before. */
  comeback: number;
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
  /** The account's villain team on the road, when this team is it (`villain`) or it's blocking this team (`blocked`). */
  encounter: { role: "villain" | "blocked"; view: RoadEncounterView } | null;
}

/** A finished Trainer Road run: the stars it earned, whether it's now your best this month, and what it did to your path (accounts). */
export type RoadRunView = DuelRunView & { stars?: number | null; best?: boolean; path?: RoadPathResult | null };

// ─── the path (phase 2) ──────────────────────────────────────────────────────

/** One trainer on a region's path, as the region page and the trainer card draw it. */
export interface RoadStepView {
  team: string;
  person: string;
  name: string;
  /** Their trainer page with this team picked. */
  href: string;
  picture: DuelPicture | null;
  kind: PathKind;
  index: number;
  state: StepState;
  /** "Brock's badge", "Hala's grand trial", "Challenge 2 of 5", "The end-game battle". */
  label: string;
}

/** A region's path with a player's place on it (every step "locked" past Kanto for a new player). */
export interface RoadPathView {
  region: string;
  regionName: string;
  game: string;
  leagueLabel: string;
  /** "badge", or Alola's "grand trial". */
  gymWord: string;
  open: boolean;
  cleared: boolean;
  /** The region whose clear opens this one (null for Kanto). */
  openedBy: string | null;
  gyms: RoadStepView[];
  league: RoadStepView[];
  leagueStep: number;
  leagueDone: boolean;
  endgame: RoadStepView;
}

/** The next trainer on a player's path. */
export interface RoadNextView {
  team: string;
  region: string;
  regionName: string;
  name: string;
  href: string;
  kind: PathKind;
  /** "Brock's badge, 1 of 8", "Kanto League, challenge 2 of 5", "The end-game battle". */
  label: string;
  picture: DuelPicture | null;
}

/** A villain team that turned up on a player's road (road encounters, picks 2026-10-24). */
export interface RoadEncounterView {
  id: string;
  /** A region's story battle, or a grunt. */
  kind: "set" | "grunt";
  region: string;
  regionName: string;
  /** The villain team's duel (team id). */
  team: string;
  /** Who you battle: "Team Rocket", or the story battle's leader ("Giovanni", "Archer"). */
  name: string;
  /** The villain team ("Team Rocket"; Hoenn's grunts are Team Magma or Team Aqua). */
  villain: string;
  /** Where the games put them ("Rocket Hideout"), when the data says. */
  place: string | null;
  /** Their page with this team picked. */
  href: string;
  picture: DuelPicture | null;
  /** Tokens they swiped when they turned up (0 when the wallet was empty). */
  swiped: number;
  /** Tokens on top of getting them back, for beating them. */
  reward: number;
  /** The path trainer waiting behind them. */
  blocks: { team: string; name: string; href: string; label: string };
}

export interface RoadRegionProgressView {
  region: string;
  name: string;
  open: boolean;
  cleared: boolean;
  badges: number;
  gyms: number;
  leagueStep: number;
  leagueSize: number;
  leagueDone: boolean;
  endgameHard: boolean;
}

/** An account's trainer card and path. */
export interface RoadProgressView {
  name: string;
  avatar: string | null;
  profile: string | null;
  xp: number;
  level: number;
  /** XP into this level, and what the next level needs. */
  into: number;
  need: number;
  color: CardColor;
  colorLabel: string;
  badges: number;
  regionsCleared: number;
  trainersBeaten: number;
  starsThisMonth: number;
  startedAt: string | null;
  champion: boolean;
  regions: RoadRegionProgressView[];
  next: RoadNextView | null;
  /** A villain team blocking the road right now. */
  encounter: RoadEncounterView | null;
  /** Story battles won: a mark on the card per villain team. */
  marks: { region: string; name: string; picture: DuelPicture | null }[];
}

/** What a finished duel did to a player's path: XP, tokens, level, card color and the milestones it earned. */
export interface RoadPathResult {
  xp: number;
  tokens: number;
  levelBefore: number;
  level: number;
  into: number;
  need: number;
  colorBefore: CardColor;
  color: CardColor;
  colorLabel: string;
  outcomes: { kind: PathOutcome["kind"] | "encounter" | "encounter_beaten" | "blocked"; title: string; line: string }[];
  next: RoadNextView | null;
  /** A villain team blocking the road after this duel (it just turned up, or it's still there). */
  encounter: RoadEncounterView | null;
  /** Prize money for the first win against this trainer this month (in `tokens` too). */
  prize?: number;
  /** Tools this duel gave (a badge, the League, a region, a first three-star win, a villain team beaten). */
  tools?: { id: ToolId; name: string; count: number }[];
}

// ─── tools (picks 2026-10-25) ────────────────────────────────────────────────

/** The Mart in a region: what's on its shelf, your bag and your balance, and the tool you can keep there. */
export interface MartView {
  region: string;
  regionName: string;
  /** What you can buy here now (Kanto's shelf opens with its badges). */
  shelf: ToolId[];
  /** The badge that opens each tool not on the shelf yet ("Brock's badge"). */
  opens: Partial<Record<ToolId, string>>;
  bag: ToolBagView;
  balance: number;
  /** A cleared region's kept tool: picked (`tool`) or still to pick (`tool` null). Null before the region is cleared. */
  keep: { tool: ToolId | null } | null;
}
