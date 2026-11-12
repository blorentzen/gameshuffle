/**
 * Head-to-head rooms (speedrun races picks 2026-11-10): shared shapes. A room is 2 to 8 entrants racing the same thing,
 * each in their own lane, ranked by how far they got and how fast. The live part runs in the speedrun relay's Room
 * object (speedrun-relay/src/room.ts; `RoomView` here mirrors its `viewOf`), the record in `versus_rooms` and
 * `versus_entrants` (supabase/versus-m1.sql). `kind` says what's raced: "speedrun" now; a two-player duel on Trainer
 * Road's trainers can be another kind with the site feeding its lanes. Client-safe.
 */

import type { DuelPicture, DuelRunView } from "@/lib/originals/duel/view";

/** What is raced: a speedrun (lanes from each runner's relay), a duel on a Trainer Road team, a trainer battle (two
 *  players duel each other with Trainer Road teams), or a tag team (two players share one side against a trainer).
 *  Lanes come from the site for everything but speedruns. */
export type VersusKind = "speedrun" | "duel" | "battle" | "tag";

/** How a team race scores a team: every member's result added up, or the team's best. */
export type TeamScore = "total" | "best";

/** A trainer battle's group: both players pick a team from the same one (battle picks 1A). */
export type BattleGroup = "gym" | "elite" | "rival" | "boss" | "champion";
export type RoomStatus = "open" | "countdown" | "running" | "finished" | "cancelled";
export type LaneStatus = "waiting" | "running" | "done" | "out";
export type OutReason = "reset" | "left" | "removed" | "timeout" | "ended" | "nostart" | "lost";
export type RoomUnit = "ms" | "turns";
export type EntrantStatus = "invited" | "joined" | "ready" | "racing" | "done" | "out" | "left" | "removed";

/** A runner's timer as their relay last saw it. */
export interface LaneLive {
  seq: number;
  connected: boolean;
  mode: "lso" | "addon" | "remote";
  canStart: boolean;
  remotes: number;
  phase: "idle" | "running" | "paused" | "ended";
  index: number | null;
  elapsedMs: number;
  at: number;
  count: number;
  splits: (number | null)[];
  last: { kind: string; index: number | null } | null;
  attempt: number;
}

export interface Lane {
  status: LaneStatus;
  attempt: number | null;
  reached: number;
  times: (number | null)[];
  finalMs: number | null;
  outAt: number | null;
  outReason: OutReason | null;
  endedAt: number | null;
  /** Site lanes: the tie-break (a duel's time in ms when turns are level) and where the player is now (a duel's turn). */
  tieMs: number | null;
  current: number | null;
  live: LaneLive | null;
}

export interface RoomEntrant {
  key: string;
  name: string;
  color: string | null;
  source: "relay" | "site";
  relayId: string | null;
  delayMs: number;
  ready: boolean;
  lane: Lane;
}

export interface RoomView {
  v: 1;
  seq: number;
  roomId: string | null;
  kind: string;
  title: string;
  checkpoints: string[];
  unit: RoomUnit;
  status: RoomStatus;
  startAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** The room's clock when the view was made (epoch ms). */
  now: number;
  entrants: RoomEntrant[];
}

export type RoomHookEvent = "started" | "lane" | "progress" | "finished" | "cancelled";

export interface RoomHookBody {
  roomId: string;
  event: RoomHookEvent;
  room: RoomView;
}

export interface VersusSettings {
  /** A duel's team and level (duels only). */
  duel?: { trainerId: string; level: "easy" | "normal" | "hard"; month: string };
  /** A trainer battle's group (battles only). */
  battle?: { group: BattleGroup };
  /** Team races and duels (co-op pick 6): 2 to 4 teams; a team scores its members' total, or its best member. */
  teams?: { count: number; score: TeamScore };
  /** A seed everyone plays (Minecraft set seed races, roster pick 11): picked by GameShuffle or typed by the host.
   *  Shown to everyone once the countdown starts, never before. Absent: each runner plays their own world. */
  seed?: string;
  /** Anyone with the link, or only people the host invites. */
  join: "link" | "invite";
  /** Runners at most, 2-8. */
  max: number;
  /** "Who wins?" bets in each runner's chat (GS Pro, on the markets engine). */
  bets: boolean;
}

/** One entrant as a page shows them (the record, plus what only the site knows). */
export interface VersusEntrantView {
  userId: string;
  name: string;
  avatar: string | null;
  username: string | null;
  seat: number;
  status: EntrantStatus;
  /** Their PB on this run, when they have one. */
  pbMs: number | null;
  place: number | null;
  finalMs: number | null;
  /** How far they got and why they stopped (a duel's losers show it). */
  reached: number | null;
  outReason: OutReason | null;
  /** A trainer battle: they've picked a team (which one stays hidden from the other player until the start), and the
   *  team once it's public (after the start, or your own). */
  teamPicked?: boolean;
  team?: BattleTeamView | null;
  /** A team race: the team they're on (1 to 4), or null before they pick. */
  squad?: number | null;
}

/** A room as its page shows it (GET /api/races/<code>). */
export interface VersusRoomView {
  code: string;
  kind: VersusKind;
  game: string;
  gameKey: string | null;
  category: string;
  checkpoints: string[];
  settings: VersusSettings;
  status: RoomStatus;
  host: { userId: string; name: string };
  startsAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  nextCode: string | null;
  entrants: VersusEntrantView[];
  /** The room's watch address (wss://…/roomwatch/<r1 token>), or null when the relay isn't set up here. */
  watchUrl: string | null;
  /** The live room when the page was made (the socket takes over). */
  live: RoomView | null;
  /** A duel: the Trainer Road team everyone plays, at the host's level. */
  duel: VersusDuelInfo | null;
  /** A trainer battle: its group (the teams to pick from come from GET /api/races/<code>/battle?teams=1). */
  battle: { group: BattleGroup; groupLabel: string } | null;
  /** The seed everyone plays, once the countdown has started (null before, or when each runner plays their own). */
  seed: string | null;
  /** The viewer: signed in, their entrant status, host, and why they can't join (when they can't). */
  me: {
    userId: string;
    status: EntrantStatus | null;
    isHost: boolean;
    joinBlock: "full" | "invite" | "setup" | "elsewhere" | "closed" | null;
    elsewhere: string | null;
    /** A duel: the viewer's own run in it, once started. */
    runId: string | null;
  } | null;
}

export interface VersusDuelInfo {
  trainerId: string;
  level: "easy" | "normal" | "hard";
  /** The duel's month (each Trainer Road duel is the same for everyone that month). */
  month: string;
  name: string;
  title: string;
  game: string;
  /** The trainer's page. */
  href: string | null;
}

/** One of a runner's latest races (the speedrun page's "Your races"). */
export interface MyRace { code: string; title: string; status: RoomStatus; place: number | null; runners: number; host: boolean; at: number }

/** A Trainer Road team as a trainer battle shows it. */
export interface BattleTeamView {
  trainerId: string;
  name: string;
  /** "Mauville City Gym Leader". */
  title: string;
  /** "Pokémon Emerald" (with a place for villain teams). */
  game: string;
  region: string | null;
  /** The cards, by short name, in team order. */
  cards: string[];
  picture: DuelPicture | null;
}

/** What a trainer battle adds to the duel arena's run (GET /api/races/<code>/battle). */
export interface BattleInfo {
  phase: "bring" | "play" | "done";
  /** The clock for whoever the battle waits on (epoch ms); null once it's over. */
  deadline: number | null;
  /** Who the battle waits on, from this viewer's side. */
  waiting: "you" | "them" | "both" | null;
  /** The coin: who goes first. */
  first: { name: string; you: boolean } | null;
  /** This player (a watcher: the first player). */
  you: { name: string; team: BattleTeamView; missed: number } | null;
  them: { name: string; team: BattleTeamView; missed: number };
  /** Picked their cards in the bring step (so the waiting player knows). */
  brought: { you: boolean; them: boolean };
  result: "won" | "lost" | "draw" | null;
  why: "knockout" | "timeout" | "left" | "cap" | null;
  /** The winner's name (spectators read it), or null. */
  winner: string | null;
  /** This pair's battles so far, from this viewer's side (players only). */
  record: { won: number; lost: number } | null;
  spectator: boolean;
  /** The room's code, for links. */
  code: string;
  /** The battle's version: a poll that brings a newer one plays the difference. */
  version: number;
}

export type BattleRunView = DuelRunView & { battle: BattleInfo };

/** What a tag team duel adds to the duel arena's run (GET /api/races/<code>/tag). */
export interface TagInfo {
  phase: "draft" | "lead" | "play" | "done";
  deadline: number | null;
  /** Who the duel waits on, from this viewer's side (watchers: "partner"). */
  waiting: "you" | "partner" | null;
  /** The other player's name (a watcher: both names). */
  partner: string;
  names: [string, string];
  /** Each of the six: who picked it. */
  owners: ("you" | "partner" | null)[];
  draft: { size: number; choices: number[] };
  /** The coin: who picked first (the other leads). */
  first: { name: string; you: boolean };
  result: "won" | "lost" | null;
  why: "knockout" | "timeout" | "left" | null;
  par: number;
  /** Stars the way a duel of this team earns them (shown; a tag duel isn't saved as anyone's best). */
  stars: number | null;
  spectator: boolean;
  missed: number;
  version: number;
  code: string;
}

export type TagRunView = DuelRunView & { tag: TagInfo };
