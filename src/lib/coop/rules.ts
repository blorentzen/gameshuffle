/**
 * Co-op games for players (client-safe, pure): Boss Fight, Five Letters, Four
 * in a Row and Shuffle Dice, played by everyone on one side. The same four run
 * on stream in break mode (GS Pro); here they're for a Discord call (the
 * Activity's Together room, src/lib/activity/room.ts) and a live night's phones
 * and TV (src/lib/party/coop.ts), both free.
 *
 * The games' rules are break mode's modules, unchanged
 * (src/lib/break/games/{boss,letters,connect,shuffleDice}.ts). They keep
 * their state between rounds in a `meta` object (the boss's health, the
 * guesses so far, the board, the dice score). Break mode keeps it on the run;
 * here `coopOpen` and `coopClose` take the meta in and hand the next one back,
 * so whoever stores the game (the room's state, the night's table row) carries
 * it from round to round.
 *
 * A game ends as a shared result: won, lost or a draw (`coopOutcome`). The
 * modules still hand out per-person points; co-op surfaces don't show them.
 *
 * The modules speak to a stream's chat ("Chat played column 3"); `forPlayers`
 * rewords that for people playing together ("You played column 3").
 */

import type { BreakAnswer, BreakGame, Judged, RoundDraft, RunMeta } from "@/lib/break/games/common";
import { bossFight } from "@/lib/break/games/boss";
import { fiveLetters } from "@/lib/break/games/letters";
import { fourInARow } from "@/lib/break/games/connect";
import { shuffleDice } from "@/lib/break/games/shuffleDice";
import type { BreakReveal, BreakRound } from "@/lib/break/types";

export type CoopGameId = "boss-fight" | "five-letters" | "four-in-a-row" | "shuffle-dice";
export const COOP_GAME_IDS: CoopGameId[] = ["boss-fight", "five-letters", "four-in-a-row", "shuffle-dice"];
export const isCoopGame = (id: unknown): id is CoopGameId => typeof id === "string" && (COOP_GAME_IDS as string[]).includes(id);

const ENGINES: Record<CoopGameId, BreakGame> = {
  "boss-fight": bossFight,
  "five-letters": fiveLetters,
  "four-in-a-row": fourInARow,
  "shuffle-dice": shuffleDice,
};

export interface CoopGameInfo {
  name: string;
  /** What one game is called: "Boss 2 of 3". */
  noun: string;
  nouns: string;
  /** What one round is called: "Guess 3 of 6". */
  roundWord: string;
  /** The most rounds one game can take. */
  maxRounds: number;
  /** How it plays, for players (no chat, no typing commands). */
  how: string;
  /** Seconds a round stays open in a call (it closes early once everyone has answered). */
  seconds: number;
}

export const COOP_GAMES: Record<CoopGameId, CoopGameInfo> = {
  "boss-fight": {
    name: "Boss Fight", noun: "boss", nouns: "bosses", roundWord: "Round", maxRounds: 5, seconds: 15,
    how: "Everyone hits the boss once a round. Take it down within five rounds. More players means a tougher boss.",
  },
  "five-letters": {
    name: "Five Letters", noun: "word", nouns: "words", roundWord: "Guess", maxRounds: 6, seconds: 40,
    how: "Everyone types a five-letter guess. The most popular one is played and its letters light up. Six guesses to find the word.",
  },
  "four-in-a-row": {
    name: "Four in a Row", noun: "game", nouns: "games", roundWord: "Move", maxRounds: 21, seconds: 25,
    how: "Everyone votes a column. The most votes drops your piece, then GameShuffle moves. Four in a row across, down or diagonally wins.",
  },
  "shuffle-dice": {
    name: "Shuffle Dice", noun: "match", nouns: "matches", roundWord: "Call", maxRounds: 12, seconds: 20,
    how: "Everyone votes to roll again or bank. The most votes decides, and a tie banks. Three Bombs lose the turn. First to 25 beats the house.",
  },
};

export type CoopResultKind = "won" | "lost" | "draw";

/** How one co-op game ended, worded for the players. */
export interface CoopResult {
  game: CoopGameId;
  result: CoopResultKind;
  line: string;
}

/** The game's result once its meta says it's over, else null. `force` ends it as it stands (out of rounds). */
export function coopOutcome(id: CoopGameId, meta: RunMeta, force = false): CoopResult | null {
  if (id === "boss-fight") {
    const b = meta.boss;
    if (!b || (!b.over && !force)) return null;
    return b.won
      ? { game: id, result: "won", line: `You took down ${b.name} in ${b.rounds} ${b.rounds === 1 ? "round" : "rounds"}.` }
      : { game: id, result: "lost", line: `${b.name} got away with ${b.hp} health left.` };
  }
  if (id === "five-letters") {
    const w = meta.letters;
    if (!w || (!w.over && !force)) return null;
    return w.solved
      ? { game: id, result: "won", line: `You got ${w.word} in ${w.rows.length}.` }
      : { game: id, result: "lost", line: `The word was ${w.word}.` };
  }
  if (id === "four-in-a-row") {
    const c = meta.c4;
    if (!c || (!c.over && !force)) return null;
    if (c.result === "chat") return { game: id, result: "won", line: "You beat GameShuffle at Four in a Row." };
    if (c.result === "bot") return { game: id, result: "lost", line: "GameShuffle won Four in a Row." };
    return { game: id, result: "draw", line: "Four in a Row ended in a draw." };
  }
  const d = meta.dice;
  if (!d || (!d.over && !force)) return null;
  if (d.chat > d.house) return { game: id, result: "won", line: `You beat the house, ${d.chat} to ${d.house}.` };
  if (d.house > d.chat) return { game: id, result: "lost", line: `The house won, ${d.house} to ${d.chat}.` };
  return { game: id, result: "draw", line: `A tie with the house at ${d.chat}.` };
}

/** Rounds this game can still take, from its own rules (break mode's `rounds`). */
export function coopRoundsOf(id: CoopGameId, meta: RunMeta): number {
  return ENGINES[id].rounds?.(meta) ?? COOP_GAMES[id].maxRounds;
}

export interface CoopOpenOptions {
  rand?: () => number;
  /** Content to avoid (bosses and words this group has had). Ignored when nothing else is left. */
  skip?: (key: string) => boolean;
}

/**
 * Opens round `played + 1` of a game. `meta` is what the rounds before left
 * (empty for a new game: `played` 0 starts it over). Returns the round and the
 * meta to keep, or null when the game has nothing more to show.
 */
export function coopOpen(id: CoopGameId, meta: RunMeta, played: number, opts: CoopOpenOptions = {}): { draft: RoundDraft; meta: RunMeta } | null {
  const ctx = {
    skip: opts.skip ?? (() => false),
    puzzles: [],
    streamer: "",
    gameOnStream: null,
    rand: opts.rand ?? Math.random,
    meta: played === 0 ? {} : meta,
    fresh: played === 0,
    roundOfGame: played + 1,
  };
  // Everything this group has seen: let earlier bosses and words back rather than stop.
  const draft = ENGINES[id].make(ctx) ?? (played === 0 ? ENGINES[id].make({ ...ctx, skip: () => false }) : null);
  if (!draft) return null;
  return { draft, meta: draft.meta ? { ...ctx.meta, ...draft.meta } : ctx.meta };
}

/** The answers' verdict on a round: the reveal, the meta to keep, and the result when that was the last round. */
export function coopClose(id: CoopGameId, round: { round: BreakRound; secret: Record<string, unknown> }, answers: BreakAnswer[], meta: RunMeta, played: number): {
  judged: Judged; meta: RunMeta; outcome: CoopResult | null;
} {
  const judged = ENGINES[id].judge(round, answers, meta);
  const next = { ...meta, ...(judged.meta ?? {}) };
  // The modules mark a game over at their own limit; out of rounds without that ends it as it stands.
  const outcome = coopOutcome(id, next) ?? (played >= coopRoundsOf(id, next) ? coopOutcome(id, next, true) : null);
  return { judged, meta: next, outcome };
}

/** The answer to keep for what a player typed or tapped, or null when it isn't one for this round. */
export function coopAccept(id: CoopGameId, text: string, round: BreakRound): string | null {
  return ENGINES[id].accept(text, round);
}

// ── Words for players ───────────────────────────────────────────────────────

const REWORD: [RegExp, string][] = [
  [/\bChat played column (\d+) and wins!/g, "You played column $1 and win!"],
  [/\bChat wins\b/g, "You win"],
  [/\bChat goes first\b/g, "You go first"],
  [/\bMore of chat joined in\b/g, "More of you joined in"],
  [/ Everyone who hit it scores\./g, ""],
  [/\bChat's\b/g, "Your"],
  [/\bchat's\b/g, "your"],
  [/\bChat\b/g, "You"],
  [/\bchat\b/g, "you"],
];

/** A line written for a stream's chat, reworded for people playing together. */
export function forPlayers(text: string): string {
  let out = text;
  for (const [re, to] of REWORD) out = out.replace(re, to);
  return out;
}

/** A round's words for players (the prompt, the tag over it, the answer box's hint). */
export function coopRoundView(r: BreakRound): BreakRound {
  return {
    ...r,
    prompt: forPlayers(r.prompt),
    hint: forPlayers(r.hint),
    ...(r.tag ? { tag: forPlayers(r.tag) } : {}),
  } as BreakRound;
}

/** A reveal's words for players. Who scored what stays out: it's one team. */
export function coopRevealView(rv: BreakReveal): BreakReveal {
  const { winners: _winners, ...rest } = rv;
  void _winners;
  return { ...rest, text: forPlayers(rv.text) };
}

// ── Results ─────────────────────────────────────────────────────────────────

export interface CoopRecord { won: number; lost: number; draw: number }

export function coopRecord(results: CoopResult[]): CoopRecord {
  const out: CoopRecord = { won: 0, lost: 0, draw: 0 };
  for (const r of results) out[r.result] += 1;
  return out;
}

/** The whole set's result: more won than lost is a win, more lost a loss, level a draw. */
export function coopOverall(results: CoopResult[]): CoopResultKind {
  const r = coopRecord(results);
  return r.won > r.lost ? "won" : r.lost > r.won ? "lost" : "draw";
}

/** The headline once a group has finished: "You won!", "You won 2 of 3", "Not this time". */
export function coopHeadline(results: CoopResult[]): string {
  if (!results.length) return "That's the game";
  const r = coopRecord(results);
  if (results.length === 1) return r.won ? "You won!" : r.lost ? "Not this time" : "A draw";
  if (r.won === results.length) return `You won all ${results.length}!`;
  if (!r.won) return r.draw ? `No wins, ${r.draw} ${r.draw === 1 ? "draw" : "draws"}` : "Not this time";
  return `You won ${r.won} of ${results.length}`;
}

/**
 * A co-op slot on a live night's scoreboard: one shared result for everyone
 * who played, through recordResults' `shared` option (the same one Chat Brain
 * at the table uses), so a co-op game never moves anyone ahead of anyone
 * else. The table wins the slot when it won more of its games than it lost:
 * everyone first, with first place's points. Otherwise (more lost, or level)
 * everyone shares last place with nothing. The crown doesn't move.
 */
export function coopNightWon(results: CoopResult[]): boolean {
  return coopOverall(results) === "won";
}
