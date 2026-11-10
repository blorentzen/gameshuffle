/**
 * Speedrunning's shared shapes (phase 1, specs/gs-speedrun/phase1-contract.md). The relay (speedrun-relay/, a
 * Cloudflare Worker) sends `RelayState` to overlays and in its webhook; the site keeps the runner's setup. Client-safe.
 */

export type RelayPhase = "idle" | "running" | "paused" | "ended";

export type RelayLastKind = "start" | "split" | "skip" | "undo" | "reset" | "finish" | "pause" | "resume";

export interface RelaySegment {
  name: string;
  /** The PB's split time, cumulative ms. */
  pbMs: number | null;
  /** The Best Segments comparison, cumulative ms (so the last one is the sum of best). */
  bestMs: number | null;
}

export interface RelayState {
  v: 1;
  /** +1 on every change. */
  seq: number;
  /** LiveSplit One is connected now. */
  connected: boolean;
  phase: RelayPhase;
  /** The current split while running or paused. */
  index: number | null;
  /** The run's time when this state was made. Overlays tick from when they got it, never from `at`. */
  elapsedMs: number;
  /** Epoch ms the relay made it. */
  at: number;
  /** Set by the site (/admin): a catalog key, or a typed name for a game we don't know. */
  game: string | null;
  category: string | null;
  /** attemptBase + Started events counted by the relay. */
  attempt: number;
  segments: RelaySegment[];
  /** This attempt's split times (cumulative ms), null = not reached or skipped. */
  splits: (number | null)[];
  /** Per split: this attempt's segment beat the best segment as read at the start. */
  golds: boolean[];
  last: { kind: RelayLastKind; index: number | null; gold?: boolean; pb?: boolean } | null;
}

export type RelayEvent = "start" | "split" | "skip" | "undo" | "reset" | "finish" | "connect" | "disconnect";

export interface RelayWebhookBody {
  relayId: string;
  event: RelayEvent;
  state: RelayState;
}

export type SpeedrunLayout = "column" | "strip";
export type SpeedrunPosition = "bottom" | "top";

/** What the Column shows under the timer (picks 2026-11-09: PB, sum of best and attempts on; the rest switches). */
export interface SpeedrunStats {
  pb: boolean;
  sob: boolean;
  attempts: boolean;
  prevSegment: boolean;
  pace: boolean;
}

export interface SpeedrunLook {
  layout: SpeedrunLayout;
  /** Where the Strip sits. */
  position: SpeedrunPosition;
  stats: SpeedrunStats;
  /** GS Pro brand theme (step 2); null = GameShuffle blue. */
  theme: string | null;
  /** GS Pro's own line in place of "Built by GameShuffle" (step 2). */
  line: string | null;
}

/** The setup screen's data (GET /api/speedrun/setup). */
export interface SpeedrunSetupView {
  /** The private address pasted into LiveSplit One (wss://…/lso/<timer token>). */
  timerAddress: string;
  /** The OBS link's path (/run/<overlay token>); the page adds its origin. */
  overlayPath: string;
  look: SpeedrunLook;
  /** The game's name as shown (a catalog game's name, or what the runner typed). */
  game: string;
  category: string;
  /** The latest attempt number. */
  attempts: number;
}

/** The relay as the setup screen sees it (GET /api/speedrun/status). */
export interface SpeedrunStatus {
  /** The timer server answered. */
  reachable: boolean;
  /** LiveSplit One is connected to it now. */
  connected: boolean;
  phase: RelayPhase;
  /** A run has started since the setup was made (or the relay saw an attempt). */
  started: boolean;
  /** The last thing that happened, and how long ago (ms), when there was one. */
  last: RelayLastKind | null;
  lastAgoMs: number | null;
  splits: number;
}
