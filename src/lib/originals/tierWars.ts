import { TIER_TOPICS, tierTopic, type TierTopicItem } from "@/data/originals/tier-wars";

/**
 * Tier Wars rules (a GameShuffle Original). Pure and client-safe.
 *
 * Everyone ranks the same handful of items into S to D tiers on their phone.
 * The reveal builds the room's tier list: each item lands in the tier most
 * people picked (a tie goes to the tied tier nearest the average). You score a
 * point for every item you put in the room's tier, and the biggest single
 * disagreement is called out as the hottest take.
 */

export const TIERS = ["S", "A", "B", "C", "D"] as const;
export const ITEMS_PER_ROUND = 6;

export type TierPhase = "ranking" | "done";

export interface TierRound {
  topic: string;
  title: string;
  items: (TierTopicItem & { id: string })[];
  phase: TierPhase;
}

/** One player's ranking: item id -> tier index (0 = S). */
export type Ballot = Record<string, number>;
export interface TierBallot { voter: number; ranks: Ballot }

export function dealTopic(topicId: string, usedTopics: string[], rand: () => number = Math.random): TierRound {
  const fresh = TIER_TOPICS.filter((t) => !usedTopics.includes(t.id));
  const topic = tierTopic(topicId) ?? (fresh.length ? fresh : TIER_TOPICS)[Math.floor(rand() * (fresh.length || TIER_TOPICS.length))];
  const pool = [...topic.items];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const items = pool.slice(0, ITEMS_PER_ROUND).map((it, i) => ({ ...it, id: String(i) }));
  return { topic: topic.id, title: topic.label, items, phase: "ranking" };
}

/** A ballot counts only when every item has a tier. */
export function cleanBallot(r: TierRound, raw: unknown): Ballot | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Ballot = {};
  for (const it of r.items) {
    const t = Number((raw as Record<string, unknown>)[it.id]);
    if (!Number.isInteger(t) || t < 0 || t >= TIERS.length) return null;
    out[it.id] = t;
  }
  return out;
}

/** The room's tier for each item. */
export function roomTiers(r: TierRound, ballots: TierBallot[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of r.items) {
    const picks = ballots.map((b) => b.ranks[it.id]).filter((t) => t !== undefined);
    if (!picks.length) continue;
    const counts = new Map<number, number>();
    for (const t of picks) counts.set(t, (counts.get(t) ?? 0) + 1);
    const max = Math.max(...counts.values());
    const avg = picks.reduce((a, b) => a + b, 0) / picks.length;
    const tied = [...counts].filter(([, n]) => n === max).map(([t]) => t);
    out[it.id] = tied.sort((a, b) => Math.abs(a - avg) - Math.abs(b - avg) || a - b)[0];
  }
  return out;
}

export function scoreRound(r: TierRound, ballots: TierBallot[]): Map<number, number> {
  const room = roomTiers(r, ballots);
  const out = new Map<number, number>();
  for (const b of ballots) {
    const hits = r.items.filter((it) => b.ranks[it.id] === room[it.id]).length;
    if (hits) out.set(b.voter, hits);
  }
  return out;
}

/** The biggest single disagreement with the room (two tiers or more), if any. */
export function hottestTake(r: TierRound, ballots: TierBallot[]): { voter: number; item: string; tier: number; room: number } | null {
  const room = roomTiers(r, ballots);
  let best: { voter: number; item: string; tier: number; room: number } | null = null;
  for (const b of ballots) for (const it of r.items) {
    const gap = Math.abs(b.ranks[it.id] - room[it.id]);
    if (gap >= 2 && (!best || gap > Math.abs(best.tier - best.room))) best = { voter: b.voter, item: it.id, tier: b.ranks[it.id], room: room[it.id] };
  }
  return best;
}
