import { PROMPT_PACKS, promptPack, type PromptPack } from "@/data/originals/most-likely";

/**
 * Most Likely To rules (a GameShuffle Original). Pure and client-safe.
 *
 * A prompt goes up on the TV ("Who's most likely to… rage quit a Mario Kart
 * race"), everyone votes for a player on their phone (yourself included), and
 * the reveal shows who the room picked. You score for reading the room: a point
 * when your vote matches the most-picked player (ties all count).
 */

export const READ_THE_ROOM_POINTS = 1;

export type LikelyPhase = "voting" | "done";

export interface LikelyRound {
  pack: string;
  prompt: string;
  phase: LikelyPhase;
}

export interface LikelyVote { voter: number; target: number }

/** `pack` is a pack id, or a pack made on the spot (the one-device tool's AI pack). */
export function dealPrompt(pack0: string | PromptPack, used: string[], rand: () => number = Math.random): LikelyRound {
  const pack = (typeof pack0 === "string" ? promptPack(pack0) : pack0) ?? PROMPT_PACKS[Math.floor(rand() * PROMPT_PACKS.length)];
  const fresh = pack.prompts.filter((p) => !used.includes(p));
  const pool = fresh.length ? fresh : pack.prompts;
  return { pack: pack.id, prompt: pool[Math.floor(rand() * pool.length)], phase: "voting" };
}

export function tally(votes: LikelyVote[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const v of votes) out.set(v.target, (out.get(v.target) ?? 0) + 1);
  return out;
}

/** The room's pick: every player with the most votes (ties share it). */
export function topPicks(votes: LikelyVote[]): number[] {
  const t = tally(votes);
  const max = Math.max(0, ...t.values());
  return max ? [...t].filter(([, n]) => n === max).map(([seat]) => seat).sort((a, b) => a - b) : [];
}

export function scoreRound(votes: LikelyVote[]): Map<number, number> {
  const top = new Set(topPicks(votes));
  const out = new Map<number, number>();
  for (const v of votes) if (top.has(v.target)) out.set(v.voter, (out.get(v.voter) ?? 0) + READ_THE_ROOM_POINTS);
  return out;
}
