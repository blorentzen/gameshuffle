/**
 * Chat Brain on stream: the pure rules for a game (no I/O, client-safe).
 * Spec: specs/gs-originals-chat-brain-stream.md (Chat plays, chat's answer,
 * play along). The store (streamGame.ts) feeds these the guesses and the board.
 *
 *   chat's answer   whatever most of chat said in the window: every guess goes
 *                   to the board answer it matches (revealed or not) or to its
 *                   own spelling group, and the biggest group wins. Ties: the
 *                   group whose latest guess came in first.
 *   the result      an unrevealed board answer is a hit (bank its points);
 *                   anything else, an empty window included, is a strike.
 *   play along      every viewer's own guess is scored too: an answer that was
 *                   still hidden when the window opened earns that viewer its
 *                   points, once per answer per board.
 */

import { isNear, matchGuess, type BoardAnswer } from "./rules";

export const STRIKES_PER_BOARD = 3;
export const GUESS_SECONDS = [15, 30, 45, 60] as const;
export type GuessSeconds = (typeof GUESS_SECONDS)[number];
export const DEFAULT_GUESS_SECONDS: GuessSeconds = 30;
export const BOARDS_PER_GAME = { min: 1, max: 5, default: 3 } as const;
/** The beat between a reveal and the next guess, so chat sees what happened. */
export const REVEAL_PAUSE_MS = 6000;
/** How long the host can overrule the last result. */
export const OVERRULE_MS = 30_000;
/** Leaning only shows groups this big, so one viewer can't put text on stream. */
export const LEANING_MIN = 2;

export interface StreamGuess {
  /** platform:viewer id, one guess each per window. */
  viewer: string;
  name: string | null;
  raw: string;
  normalized: string;
  at: number;
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
  /** The board answer this group matches (revealed or not), else null. */
  rank: number | null;
  /** When the group's latest guess came in (ties go to the earliest). */
  lastAt: number;
}

export interface ChatAnswer {
  label: string;
  count: number;
  total: number;
  share: number;
  rank: number | null;
}

export type WindowOutcome =
  | { result: "hit"; rank: number; points: number; label: string }
  | { result: "miss"; reason: "not_on_board" | "already"; label: string }
  | { result: "empty" };

export function isGuessSeconds(n: number): n is GuessSeconds {
  return (GUESS_SECONDS as readonly number[]).includes(n);
}

/** Group a window's guesses: board answers by rank, everything else by spelling. */
export function buckets(guesses: StreamGuess[], board: BoardAnswer[]): Bucket[] {
  const out = new Map<string, Bucket & { raws: Map<string, number> }>();
  const loose: string[] = [];
  for (const g of guesses) {
    if (!g.normalized) continue;
    const hit = matchGuess(g.normalized, board, []);
    let key: string;
    if (hit) key = `#${hit.rank}`;
    else key = loose.find((k) => k === g.normalized || isNear(k, g.normalized)) ?? (loose.push(g.normalized), g.normalized);
    const b = out.get(key) ?? { key, label: hit?.label ?? "", count: 0, rank: hit?.rank ?? null, lastAt: 0, raws: new Map<string, number>() };
    b.count += 1;
    b.lastAt = Math.max(b.lastAt, g.at);
    if (!hit) b.raws.set(g.raw, (b.raws.get(g.raw) ?? 0) + 1);
    out.set(key, b);
  }
  return [...out.values()]
    .map(({ raws, ...b }) => ({
      ...b,
      label: b.rank !== null ? b.label : [...raws.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0]?.[0] ?? b.key,
    }))
    .sort((x, y) => y.count - x.count || x.lastAt - y.lastAt);
}

/** Chat's answer for a window, or null when nobody guessed. */
export function chatAnswer(guesses: StreamGuess[], board: BoardAnswer[]): ChatAnswer | null {
  const groups = buckets(guesses, board);
  const top = groups[0];
  if (!top) return null;
  const total = groups.reduce((n, g) => n + g.count, 0);
  return { label: top.label, count: top.count, total, share: total ? top.count / total : 0, rank: top.rank };
}

export function outcomeFor(answer: ChatAnswer | null, board: BoardAnswer[], revealed: number[]): WindowOutcome {
  if (!answer) return { result: "empty" };
  if (answer.rank === null) return { result: "miss", reason: "not_on_board", label: answer.label };
  if (revealed.includes(answer.rank)) return { result: "miss", reason: "already", label: answer.label };
  const a = board.find((b) => b.rank === answer.rank)!;
  return { result: "hit", rank: a.rank, points: a.points, label: a.label };
}

/** The board is over: everything found, or three strikes. */
export function boardOver(board: BoardAnswer[], revealed: number[], strikes: number): boolean {
  return board.every((b) => revealed.includes(b.rank)) || strikes >= STRIKES_PER_BOARD;
}

/** What chat is leaning toward right now: the top groups of at least LEANING_MIN viewers. */
export function leaning(guesses: StreamGuess[], board: BoardAnswer[], top = 3): { label: string; count: number; share: number }[] {
  const groups = buckets(guesses, board);
  const total = groups.reduce((n, g) => n + g.count, 0);
  return groups.filter((g) => g.count >= LEANING_MIN).slice(0, top).map((g) => ({ label: g.label, count: g.count, share: total ? g.count / total : 0 }));
}

/**
 * Play-along points for one window. `hiddenAtOpen` = board ranks not yet
 * revealed when the window opened; `earned` = ranks each viewer already
 * scored on this board. Returns the new awards (viewer → rank).
 */
export function playAlongAwards(
  guesses: StreamGuess[],
  board: BoardAnswer[],
  hiddenAtOpen: number[],
  earned: Map<string, Set<number>>,
): Map<string, { rank: number; points: number; name: string | null }> {
  const found = board.filter((b) => !hiddenAtOpen.includes(b.rank)).map((b) => b.rank);
  const awards = new Map<string, { rank: number; points: number; name: string | null }>();
  for (const g of guesses) {
    const hit = matchGuess(g.normalized, board, found);
    if (!hit || earned.get(g.viewer)?.has(hit.rank)) continue;
    awards.set(g.viewer, { rank: hit.rank, points: hit.points, name: g.name });
  }
  return awards;
}

const shout = (s: string) => s.toUpperCase();

/** The chat line for a window's result. */
export function resultLine(o: WindowOutcome, ctx: { strikes: number; score: number }): string {
  const strikes = `✖ Strike ${ctx.strikes}.`;
  switch (o.result) {
    case "hit": return `🧠 Chat said ${shout(o.label)}: #${o.rank} on the board, ${o.points} points! (${ctx.score} so far)`;
    case "empty": return `🧠 Nobody answered. ${strikes} Answer with !a <your answer>.`;
    default:
      return o.reason === "already"
        ? `🧠 Chat said ${shout(o.label)} again: it's already up there. ${strikes}`
        : `🧠 Chat said ${shout(o.label)}: not on the board. ${strikes}`;
  }
}

/** The line when a board ends. `rest` = answers revealed without points. */
export function boardEndLine(i: { cleared: boolean; strikes: number; boardPoints: number; rest: BoardAnswer[]; last: boolean }): string {
  const head = i.cleared
    ? `🧠 Board cleared! Chat found them all for ${i.boardPoints} points${i.strikes === 0 ? " with no strikes. Perfect board!" : "."}`
    : `🧠 Three strikes! Chat banked ${i.boardPoints} on this board.`;
  const rest = i.rest.length ? ` The rest: ${i.rest.map((r) => `#${r.rank} ${r.label}`).join(", ")}.` : "";
  return `${head}${rest}${i.last ? "" : " Mods: !cb next for the next board."}`.slice(0, 480);
}

export function finalLine(i: { score: number; boards: number; top: { name: string; points: number }[] }): string {
  const top = i.top.length ? ` Top brains: ${i.top.map((t) => `${t.name} ${t.points}`).join(", ")}.` : "";
  return `🧠 Game over! Chat scored ${i.score} points over ${i.boards} board${i.boards === 1 ? "" : "s"}.${top}`.slice(0, 480);
}
