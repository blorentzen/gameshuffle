/**
 * What every break game provides, and helpers they share. Pure: no database,
 * so the games can be tested on their own (scripts/test-break-games.ts).
 *
 * A game makes a round (what viewers see, plus a private answer), says
 * whether a chat message is an answer to it, and judges the answers once the
 * window closes. Points are per viewer; there are no "first right" bonuses
 * (stream delay would decide them).
 */

import type { BreakGameId, BreakReveal, BreakRound, DiceFace } from "../types";

export interface RoundDraft {
  /** Identifies the content, for the 30-day no-repeat list and pulling. Null for luck rounds. */
  key: string | null;
  round: BreakRound;
  secret: Record<string, unknown>;
  /** Game state to keep for the next rounds (merged into the break's meta when the round opens). */
  meta?: RunMeta;
  /** This round's window when it isn't the game's usual one (Item Box Royale's knockout waves). */
  seconds?: number;
  /** Nothing to answer this round (a knockout wave): no grace seconds. */
  quiet?: boolean;
}

export interface MakeContext {
  /** True when this channel saw the item in the last 30 days, or staff pulled it. */
  skip: (key: string) => boolean;
  /** Daily puzzle ids to prefer (the game on stream first). */
  puzzles: string[];
  /** The streamer's display name, for Handicap Vote. */
  streamer: string;
  /** The game on stream, if any (a GameShuffle game slug). */
  gameOnStream: string | null;
  rand: () => number;
  /** The break's memory: what multi-round games (Tier War Live, Next Build, Shuffle Dice) keep between rounds. */
  meta: RunMeta;
  /** The first round of this game's turn in the lineup: start its state over. */
  fresh: boolean;
  /** Which round of the game this is (1-based). */
  roundOfGame: number;
  /** What the game's `load` fetched for this round (trivia questions, a Chat Brain question). */
  data?: unknown;
}

export interface BreakAnswer {
  platform: string;
  viewer: string;
  name: string | null;
  answer: string;
  /** When it came in (ms). */
  at?: number;
}

export interface Award {
  platform: string;
  viewer: string;
  name: string | null;
  points: number;
}

export interface RunMeta {
  chatStreak?: number;
  handicap?: string | null;
  /** What chat picked or called for the streamer's next game. */
  nextPick?: string | null;
  tier?: { topic: string; label: string; items: { label: string; image?: string }[]; room: Record<string, string> } | null;
  build?: { pool: string; label: string; noun: string; rules: Record<string, boolean>; slots: { key: string; label: string }[]; picks: { slot: string; id: string; label: string }[] } | null;
  dice?: {
    chat: number;
    house: number;
    turn: { kept: DiceFace[]; roll: DiceFace[]; bombs: number; bust: boolean };
    decisions: number;
    over: boolean;
  } | null;
  /** Chat Sets the Bounty: the challenge chat set for the next game, who voted for it, and whether it's been settled. */
  bounty?: {
    label: string;
    text: string;
    tokens: number;
    voters: { platform: string; viewer: string; name: string }[];
    status: "open" | "paid" | "missed";
    setAt: string;
  } | null;
  /** Four in a Row: the board (42 cells), moves made, and the result once it's over. */
  c4?: { board: string; moves: number; over: boolean; result: "chat" | "bot" | "draw" | null; last: number | null } | null;
  /** Boss Fight: the boss, everyone who's hit it, and how it ended. */
  boss?: {
    name: string;
    glyph: string;
    hp: number;
    maxHp: number;
    fighters: { platform: string; viewer: string; name: string; hits: number; crits: number; damage: number }[];
    /** Most hitters in one round so far (sets the boss's health). */
    peak: number;
    rounds: number;
    over: boolean;
    won: boolean;
  } | null;
  /** Five Letters: the word, the guesses played, and how it ended. */
  letters?: { word: string; category: string; rows: { word: string; marks: string }[]; over: boolean; solved: boolean } | null;
  /** Kart Derby: who's in which lane, and the race, drawn when joining closes. */
  derby?: {
    lanes: { lane: number; label: string; racers: { platform: string; viewer: string; name: string }[] }[];
    /** Where each lane is (0 to 100) after each stretch; stretch 0 is the start. */
    marks: number[][];
    events: { at: number; lane: number; text: string }[][];
    order: number[];
    shown: number;
  } | null;
  /** Item Box Royale: who joined and the knockouts, decided when joining closes. */
  royale?: {
    players: { platform: string; viewer: string; name: string }[];
    waves: { out: number[]; lines: string[] }[];
    shown: number;
    winner: number | null;
  } | null;
}

export interface Judged {
  awards: Award[];
  reveal: BreakReveal;
  /** One line for chat, or null to stay quiet. */
  line: string | null;
  meta?: RunMeta;
}

/** What a hosted game (one that runs another engine, like Stream Bingo) gets to work with. */
export interface HostedContext { communityId: string; ownerUserId: string; streamer: string; liveSlug: string | null }

/** What a game's `load` and `persist` get: the channel, the game on stream, and (for `load`) what this channel has seen lately. */
export interface LoadContext extends HostedContext { gameOnStream: string | null; skip?: (key: string) => boolean }

/**
 * A game that runs on another engine with its own database (Stream Bingo):
 * the runner opens it, checks whether it finished early, and closes it.
 */
export interface HostedGame {
  open: (ctx: HostedContext) => Promise<RoundDraft | null>;
  finished: (secret: Record<string, unknown>) => Promise<boolean>;
  close: (draft: { round: BreakRound; secret: Record<string, unknown> }) => Promise<Judged>;
  /** Live progress for the break screen. */
  progress?: (secret: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  /** Moves the hosted game along on every tick while its round is open (bingo calls its numbers). */
  tick?: (secret: Record<string, unknown>) => Promise<void>;
}

export interface BreakGame {
  id: BreakGameId;
  hosted?: HostedGame;
  /** Each viewer's first answer counts and later ones are ignored (Zoomed In: one guess each). */
  oneGuess?: boolean;
  /** Every different answer a viewer gives counts, not only their latest (Roster Rush). */
  multiAnswer?: boolean;
  /** Show what's been answered so far while the round is open (Roster Rush's board). */
  liveAnswers?: boolean;
  /** Fetches what `make` needs from the database (approved trivia, an open Chat Brain question). Null = nothing to play. */
  load?: (ctx: LoadContext) => Promise<unknown>;
  /** Saves the answers somewhere else after judging (Chat Brain keeps them as survey answers). */
  persist?: (draft: { round: BreakRound; secret: Record<string, unknown> }, answers: BreakAnswer[], ctx: LoadContext) => Promise<void>;
  /** Rounds this turn when it isn't fixed (a Mario Kart build has four parts, a Smash fighter one). */
  rounds?: (meta: RunMeta) => number;
  make: (ctx: MakeContext) => RoundDraft | null;
  /** The answer to store for a chat message, or null when it isn't one. */
  accept: (text: string, round: BreakRound) => string | null;
  judge: (draft: { round: BreakRound; secret: Record<string, unknown> }, answers: BreakAnswer[], meta: RunMeta) => Judged;
}

export const pick = <T,>(list: readonly T[], rand: () => number): T => list[Math.floor(rand() * list.length)];

export function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Most votes wins; a tie (or no votes) is settled at random among the tied options. */
export function majority(answers: BreakAnswer[], keys: string[], rand: () => number): { winner: string; counts: Record<string, number> } {
  const counts = count(answers);
  const top = Math.max(0, ...keys.map((k) => counts[k] ?? 0));
  const tied = keys.filter((k) => (counts[k] ?? 0) === top);
  return { winner: tied[Math.floor(rand() * tied.length)], counts };
}

/** "1".."n" from a short message, else null. */
export function choiceKey(text: string, n: number): string | null {
  const m = text.trim().match(/^#?([1-9])\.?$/);
  if (!m) return null;
  const k = Number(m[1]);
  return k >= 1 && k <= n ? String(k) : null;
}

export function count(answers: BreakAnswer[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of answers) out[a.answer] = (out[a.answer] ?? 0) + 1;
  return out;
}

export const nameOf = (a: BreakAnswer) => a.name || "Someone";

/** "8 of 11 got it" / "Nobody answered". */
export function tally(right: number, answered: number): string {
  if (!answered) return "Nobody answered";
  if (right === answered) return answered === 1 ? "The one answer was right" : `All ${answered} got it`;
  return `${right} of ${answered} got it`;
}

/**
 * Closest wins: 3, 2 and 1 point for the three closest distances (ties share
 * a place), plus `exactBonus` for hitting it. Used by Closest Guess and Lucky
 * Number.
 */
export function closestAwards(answers: BreakAnswer[], target: number, exactBonus: number): { awards: Award[]; winners: { name: string; detail: string; points: number }[] } {
  const scored = answers
    .map((a) => ({ a, n: Number(a.answer) }))
    .filter((x) => Number.isFinite(x.n))
    .map((x) => ({ ...x, d: Math.abs(x.n - target) }));
  const distances = [...new Set(scored.map((x) => x.d))].sort((p, q) => p - q).slice(0, 3);
  const awards: Award[] = [];
  const winners: { name: string; detail: string; points: number }[] = [];
  for (const x of scored) {
    const place = distances.indexOf(x.d);
    if (place < 0) continue;
    const points = 3 - place + (x.d === 0 ? exactBonus : 0);
    awards.push({ platform: x.a.platform, viewer: x.a.viewer, name: x.a.name, points });
    winners.push({ name: nameOf(x.a), detail: String(x.n), points });
  }
  winners.sort((p, q) => q.points - p.points);
  return { awards, winners: winners.slice(0, 5) };
}

/** Everyone whose answer is in `right` gets `points`. */
export function rightAwards(answers: BreakAnswer[], right: Set<string>, points: number): Award[] {
  return answers.filter((a) => right.has(a.answer)).map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points }));
}

/** Tidy a line for chat: one line, no more than Twitch's 500 characters. */
export const chatLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 480);
