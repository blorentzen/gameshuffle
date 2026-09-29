import { WORD_PACKS, wordPack } from "@/data/originals/odd-one-out";

/**
 * Odd One Out rules (a GameShuffle Original). Pure and client-safe: live nights
 * run it on the server, the pass-the-phone tool runs it in the browser.
 *
 * Everyone gets the same secret word except one player, who only sees the
 * category. Players give one-word hints out loud, then vote on who's faking it.
 * If the odd one out gets the most votes (ties included) they're caught, and get
 * one guess at the word.
 */

export const MIXED = "mixed";
/** Points for voting for the odd one out. */
export const CATCH_POINTS = 2;
/** Points for the odd one out when nobody catches them. */
export const ESCAPE_POINTS = 3;
/** Points for the odd one out when caught but they guess the word. */
export const GUESS_POINTS = 2;

export type OddPhase = "hints" | "guess" | "done";

/** The table's side of a round: the answer and where it's up to. Never sent to phones before the reveal. */
export interface OddRound {
  pack: string;
  category: string;
  word: string;
  odd: number;
  /** Who gives the first hint. */
  start: number;
  phase: OddPhase;
  guess?: string | null;
  guessOk?: boolean | null;
}

/** What one seat privately holds in a round. */
export type OddHand = { odd: false; word: string; category: string } | { odd: true; category: string };

export interface OddVote { voter: number; target: number }

/** Deal a round: a word from the pack (not used yet tonight), an odd one out and a first hinter. */
export function dealRound(players: number[], packId: string, used: string[], rand: () => number = Math.random): OddRound {
  if (players.length < 3) throw new Error("need_three");
  const pack = wordPack(packId) ?? WORD_PACKS[Math.floor(rand() * WORD_PACKS.length)];
  const fresh = pack.words.filter((w) => !used.includes(w));
  const pool = fresh.length ? fresh : pack.words;
  const word = pool[Math.floor(rand() * pool.length)];
  const odd = players[Math.floor(rand() * players.length)];
  // The odd one out never starts: going first with no word is too hard.
  const starters = players.filter((p) => p !== odd);
  const start = starters[Math.floor(rand() * starters.length)];
  return { pack: pack.id, category: pack.category, word, odd, start, phase: "hints" };
}

export function handFor(r: OddRound, seat: number): OddHand {
  return seat === r.odd ? { odd: true, category: r.category } : { odd: false, word: r.word, category: r.category };
}

/** Votes per seat. */
export function tally(votes: OddVote[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const v of votes) out.set(v.target, (out.get(v.target) ?? 0) + 1);
  return out;
}

/** Caught: the odd one out has at least one vote and nobody has more. */
export function isCaught(r: OddRound, votes: OddVote[]): boolean {
  const t = tally(votes);
  const mine = t.get(r.odd) ?? 0;
  return mine > 0 && mine >= Math.max(0, ...t.values());
}

/** Forgiving match: case, spacing, punctuation and trailing plural s's don't matter. */
export function guessMatches(guess: string | null | undefined, word: string): boolean {
  // Trailing s's all go, so "Cheese puff", "cheese puffs" and "cheese puffss" all match "Cheese puffs".
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s+$/, "");
  return !!guess && norm(guess) === norm(word) && norm(word).length > 0;
}

/** Points each seat earned in a finished round. */
export function scoreRound(r: OddRound, votes: OddVote[]): Map<number, number> {
  const out = new Map<number, number>();
  const add = (seat: number, n: number) => out.set(seat, (out.get(seat) ?? 0) + n);
  for (const v of votes) if (v.voter !== r.odd && v.target === r.odd) add(v.voter, CATCH_POINTS);
  if (!isCaught(r, votes)) add(r.odd, ESCAPE_POINTS);
  else if (r.guessOk) add(r.odd, GUESS_POINTS);
  return out;
}

/** Finishing order from round totals, first place first. Ties go to the earlier seat. */
export function finishingOrder(players: number[], totals: Map<number, number>): number[] {
  return [...players].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a - b);
}
