import { matchGuess, normalize, type BoardAnswer } from "@/lib/chatbrain/rules";
import { TIER_TOPICS, type TierTopicItem } from "@/data/originals/tier-wars";
import { AGENDA_CARDS } from "@/data/originals/agendas";
import type { PartyCard } from "@/data/party/cards";
import { ITEMS_PER_ROUND, TIERS, roomTiers, type Ballot } from "@/lib/originals/tierWars";

/**
 * The Weekly Challenge (a GameShuffle Original), pure and client-safe.
 *
 * Weeks start Monday, UTC. Each week has an online Weekly Tier War (six items
 * everyone ranks S to D; the site-wide ranking is revealed the next Monday and
 * you score 1 per item placed where the crowd did) and one shared agenda for
 * every live night that week (+3 to your week when a table confirms it).
 * Picks are automatic and deterministic per week; staff can swap them.
 */

/** Monday of the first Weekly Challenge. */
export const WEEKLY_EPOCH = "2026-09-28";
/** What finishing the shared agenda adds to your week. */
export const AGENDA_WEEK_POINTS = 3;
/** A top-10 finish earns the profile badge. */
export const BADGE_RANK = 10;

export type WeeklyItem = TierTopicItem & { id: string };

/** Monday of the week containing `d` (UTC), as YYYY-MM-DD. */
export function weekOf(d: Date = new Date()): string {
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

export function addWeeks(week: string, n: number): string {
  return new Date(Date.parse(`${week}T00:00:00Z`) + n * 7 * 86400000).toISOString().slice(0, 10);
}

/** 1 for the first week. */
export function weekNumber(week: string): number {
  return Math.round((Date.parse(`${week}T00:00:00Z`) - Date.parse(`${WEEKLY_EPOCH}T00:00:00Z`)) / (7 * 86400000)) + 1;
}

/** When a week's ranking is revealed: the next Monday, 00:00 UTC. */
export function revealAt(week: string): string {
  return `${addWeeks(week, 1)}T00:00:00.000Z`;
}

function seeded(seed: number): () => number {
  let h = seed >>> 0;
  return () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Agendas that fit any game, so the one shared mission works at every live night. */
export const WEEKLY_AGENDAS: PartyCard[] = AGENDA_CARDS.filter((c) => !c.games && !c.retired);

/** Six items from a topic, in a stable order for the week. */
export function weekItems(topicId: string, week: string): WeeklyItem[] | null {
  const topic = TIER_TOPICS.find((t) => t.id === topicId);
  if (!topic) return null;
  return shuffle(topic.items, seeded(weekNumber(week) * 7919 + 17)).slice(0, ITEMS_PER_ROUND)
    .map((it, i) => ({ ...it, id: String(i) }));
}

/**
 * The automatic pick for a week: walks a fixed shuffle of every topic and every
 * any-game agenda, one step per week, so nothing repeats until the list cycles.
 */
export function autoPick(week: string): { topicId: string; title: string; items: WeeklyItem[]; agendaCardId: string } {
  const n = Math.max(0, weekNumber(week) - 1);
  const topics = shuffle(TIER_TOPICS.filter((t) => t.items.length >= ITEMS_PER_ROUND), seeded(20260928));
  const agendas = shuffle(WEEKLY_AGENDAS, seeded(20260929));
  const topic = topics[n % topics.length];
  return { topicId: topic.id, title: topic.label, items: weekItems(topic.id, week)!, agendaCardId: agendas[n % agendas.length].id };
}

/** A ballot counts only when every item has a tier. */
export function cleanWeeklyBallot(items: WeeklyItem[], raw: unknown): Ballot | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Ballot = {};
  for (const it of items) {
    const t = Number((raw as Record<string, unknown>)[it.id]);
    if (!Number.isInteger(t) || t < 0 || t >= TIERS.length) return null;
    out[it.id] = t;
  }
  return out;
}

/** The site-wide tier for each item, by the same rule as a live Tier Wars room. */
export function crowdTiers(items: WeeklyItem[], ballots: Ballot[]): Record<string, number> {
  return roomTiers({ topic: "", title: "", items, phase: "done" }, ballots.map((ranks, voter) => ({ voter, ranks })));
}

export function tierScore(items: WeeklyItem[], ballot: Ballot | null, crowd: Record<string, number>): number {
  if (!ballot) return 0;
  return items.filter((it) => ballot[it.id] !== undefined && ballot[it.id] === crowd[it.id]).length;
}

/** Standard competition ranks (1, 2, 2, 4) by total, highest first. */
export function rankTotals<T extends { total: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || sorted[i - 1].total !== r.total) rank = i + 1;
    return { ...r, rank };
  });
}

// ─── survey weeks (Chat Brain) ───────────────────────────────────────────────

export const SURVEY_PREDICTIONS = 3;

/**
 * Scores a player's predictions against the week's board: each prediction that
 * matches a board answer (same matching as play: aliases and close spellings)
 * earns that answer's points. Two predictions can't both claim one answer.
 */
export function scorePredictions(predictions: string[] | null, board: BoardAnswer[]): { points: number; hits: number[] } {
  const found: number[] = [];
  let points = 0;
  for (const p of predictions ?? []) {
    const hit = matchGuess(p, board, found);
    if (hit) { found.push(hit.rank); points += hit.points; }
  }
  return { points, hits: found };
}

/** Cleans a submitted set of predictions: up to three short, distinct answers. Null if none are usable. */
export function cleanPredictions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw.slice(0, SURVEY_PREDICTIONS)) {
    const t = typeof r === "string" ? r.trim().replace(/\s+/g, " ").slice(0, 40) : "";
    const key = normalize(t);
    if (!t || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.length ? out : null;
}
