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

export type RelayEvent = "start" | "split" | "skip" | "undo" | "reset" | "finish" | "connect" | "disconnect" | "info";

/**
 * What GameShuffle for LiveSplit (the desktop add-on, picks 2026-11-10) says about the splits file. LiveSplit One
 * sends nothing like it. game, category and attempts are null when the runner turned sharing off.
 */
export interface TimerInfo {
  addon: string;
  game: string | null;
  category: string | null;
  attempts: number | null;
  runKey: string | null;
  /** The phone remote may start, split and reset this timer. */
  remote: boolean;
}

export interface RelayWebhookBody {
  relayId: string;
  event: RelayEvent;
  state: RelayState;
  /** Only with "info". */
  timer?: TimerInfo;
}

/** Which timer the setup page leads with (LiveSplit on Windows first, LiveSplit One for any browser). */
export type TimerChoice = "livesplit" | "lso";

/** Where game, category and attempts came from (the add-on's pick 2: LiveSplit fills them; typed values win). */
export interface SpeedrunTimerSettings {
  choice: TimerChoice;
  /** Game and category came from LiveSplit, not typed, so LiveSplit may change them. */
  auto: { game: boolean; category: boolean };
  /** The runner typed an attempt count: LiveSplit's never replaces it until they ask for it back. */
  typedAttempts: boolean;
  /** What LiveSplit last said (sharing on), for the setup page's "From LiveSplit" lines. */
  from: { game: string | null; category: string | null; attempts: number | null; at: string } | null;
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

export type SpeedrunSurface = "dark" | "light" | "glass";
/** Behind the panel: glyphs (the glow and GameShuffle's glyph field, the default), the glow alone, flat, or a pattern. */
export type SpeedrunFill = "glyphs" | "glow" | "solid" | "stripes" | "dots";
export type SpeedrunFont = "rubik" | "gabarito" | "kanit" | "exo" | "titan" | "mplus" | "russo" | "lilita" | "bungee" | "bebas" | "chakra" | "fredoka" | "grotesk";
/** The GameShuffle line under the Column: "Built by GameShuffle", the mark alone, or nothing. */
export type SpeedrunBrand = "inside" | "mark" | "off";

/**
 * How the overlay looks (launch picks 2026-11-10, the MMR card's split). Free: layout, where the Strip sits, the
 * numbers, the surface, GameShuffle blue or one color of your own, glyphs, glow or solid, Rubik or GameShuffle's font,
 * the Built by line or the mark. GS Pro or Supporter looks: brand themes, two colors of your own, stripes and dots,
 * the other fonts, a two-color border, hiding the GameShuffle line or a line of your own (src/lib/speedrun/look.ts).
 */
export interface SpeedrunLook {
  layout: SpeedrunLayout;
  /** Where the Strip sits. */
  position: SpeedrunPosition;
  stats: SpeedrunStats;
  surface: SpeedrunSurface;
  /** "gs" (GameShuffle blue), "accent" (one color of your own), a brand theme id, or "custom" (two colors). */
  colors: string;
  accent: string;
  custom: [string, string];
  fill: SpeedrunFill;
  font: SpeedrunFont;
  border: "none" | "two";
  brand: SpeedrunBrand;
  /** A line of your own in place of the GameShuffle line (GS Pro or Supporter looks). */
  line: string | null;
}

/** Step 2's settings (`speedrun_setups.settings`): the "PB this run" prediction (GS Pro), the chat commands and how long
 *  replies wait so chat never gets a split before the stream shows it. */
export interface SpeedrunSettings {
  prediction: {
    on: boolean;
    /** Bets lock once this many splits are done (1-based); null = a quarter of the way in. */
    lockSplit: number | null;
  };
  commands: { pb: boolean; pace: boolean; splits: boolean };
  /** Seconds chat replies, prediction lines and the live page wait (the stream delay). */
  replyDelay: number;
  timer: SpeedrunTimerSettings;
}

/** The "PB this run" prediction as the overlay, the phone remote and the live page show it. */
export interface SpeedrunPredictionView {
  marketId: string;
  attempt: number;
  status: "open" | "locked" | "settled" | "cancelled";
  /** Bets lock once this many splits are done, and that split's name. */
  lockAfter: number;
  lockName: string | null;
  /** Share of the tokens on PB, 0-100 (rounded); null when nobody has put any in. */
  pbPct: number | null;
  /** Tokens in, and how many people put them in. */
  total: number;
  people: number;
  pb: { total: number; people: number };
  no: { total: number; people: number };
  /** Once settled: which side won, how many people were on it, and what they split. */
  result: { winner: "pb" | "no"; winners: number; pot: number; refunded: boolean } | null;
  /** When it was settled or refunded (epoch ms), for showing the result a while. */
  endedAt: number | null;
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
  settings: SpeedrunSettings;
  /** The run's split names (from LiveSplit One, or typed in setup for the phone remote). */
  splits: string[];
  /** The splits came from LiveSplit One with times (typing new names starts them fresh). */
  splitsTimed: boolean;
  /** GS Pro (the prediction is GS Pro). */
  isPro: boolean;
  /** GS Pro or Supporter looks: the overlay draws the look's paid choices (otherwise their free versions). */
  looks: boolean;
  /** Twitch is connected (chat commands and bets need the bot in chat). */
  twitch: boolean;
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
  /** Which timer is connected: the desktop add-on or LiveSplit One (null when none). */
  timer: TimerChoice | null;
  /** Game, category and attempts as saved now, and where they came from: LiveSplit fills them while the page is open. */
  fill: { game: string; category: string; attempts: number; timer: SpeedrunTimerSettings } | null;
}
