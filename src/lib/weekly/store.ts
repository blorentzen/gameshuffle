/**
 * The Weekly Challenge store (service role). Rules live in
 * src/lib/originals/weekly.ts; this file reads and writes weekly_challenges
 * and weekly_entries (supabase/weekly-challenge-m1.sql).
 *
 * Weeks are created on first read (the automatic pick) and revealed lazily:
 * the first read after Monday 00:00 UTC reveals last week, and the Monday cron
 * does the same so it happens even on a quiet morning. The reveal claims the
 * row (open → revealing) so two readers can't score it twice.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { AGENDA_CARDS } from "@/data/originals/agendas";
import {
  AGENDA_WEEK_POINTS, BADGE_RANK, addWeeks, autoPick, cleanWeeklyBallot, crowdTiers, rankTotals, tierScore, weekItems, weekOf,
  type WeeklyItem,
} from "@/lib/originals/weekly";
import type { Ballot } from "@/lib/originals/tierWars";

export interface WeekRow {
  week_start: string;
  topic_id: string;
  title: string;
  items: WeeklyItem[];
  agenda_card_id: string;
  status: "open" | "revealing" | "revealed";
  crowd: Record<string, number> | null;
  players: number;
  picked_by: string | null;
  revealed_at: string | null;
  discord_posted_at: string | null;
}

export interface EntryRow {
  week_start: string;
  user_id: string;
  ballot: Ballot | null;
  tier_score: number | null;
  agenda_points: number;
  total: number | null;
  rank: number | null;
}

/** Thrown when the tables aren't there yet, so callers can show "coming soon". */
export class WeeklyNotReady extends Error {}

function notReady(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
}

export async function getWeek(week: string): Promise<WeekRow | null> {
  const { data, error } = await createServiceClient().from("weekly_challenges").select("*").eq("week_start", week).maybeSingle();
  if (notReady(error)) throw new WeeklyNotReady();
  if (error) throw error;
  return (data as WeekRow | null) ?? null;
}

/** The week's row, creating it from the automatic pick on first use. */
export async function ensureWeek(week: string): Promise<WeekRow> {
  const have = await getWeek(week);
  if (have) return have;
  const pick = autoPick(week);
  const { error } = await createServiceClient().from("weekly_challenges").upsert({
    week_start: week, topic_id: pick.topicId, title: pick.title, items: pick.items, agenda_card_id: pick.agendaCardId,
  }, { onConflict: "week_start", ignoreDuplicates: true });
  if (notReady(error)) throw new WeeklyNotReady();
  if (error) throw error;
  return (await getWeek(week))!;
}

export function agendaCard(id: string) {
  return AGENDA_CARDS.find((c) => c.id === id) ?? null;
}

export type SaveBallotResult = { ok: true; ballot: Ballot } | { ok: false; error: "closed" | "bad_ballot" };

/** Saves (or changes) a player's ranking for the current week. */
export async function saveBallot(userId: string, raw: unknown): Promise<SaveBallotResult> {
  const week = await ensureWeek(weekOf());
  if (week.status !== "open") return { ok: false, error: "closed" };
  const ballot = cleanWeeklyBallot(week.items, raw);
  if (!ballot) return { ok: false, error: "bad_ballot" };
  const { error } = await createServiceClient().from("weekly_entries").upsert(
    { week_start: week.week_start, user_id: userId, ballot, updated_at: new Date().toISOString() },
    { onConflict: "week_start,user_id" },
  );
  if (error) throw error;
  return { ok: true, ballot };
}

export async function getEntry(week: string, userId: string): Promise<EntryRow | null> {
  const { data } = await createServiceClient().from("weekly_entries").select("*").eq("week_start", week).eq("user_id", userId).maybeSingle();
  return (data as EntryRow | null) ?? null;
}

export async function countEntries(week: string): Promise<number> {
  const { count } = await createServiceClient().from("weekly_entries").select("user_id", { count: "exact", head: true })
    .eq("week_start", week).not("ballot", "is", null);
  return count ?? 0;
}

/** Accounts that finished the week's shared agenda at a live night (confirmed at the table). */
async function agendaFinishers(week: WeekRow): Promise<Set<string>> {
  const { data } = await createServiceClient().from("party_points").select("user_id")
    .like("ref", `weekly:%:${week.week_start}`).eq("card_id", week.agenda_card_id).not("user_id", "is", null).limit(5000);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

/**
 * Scores a finished week: the crowd's tiers from every ballot, 1 per matching
 * item, +3 for the shared agenda, then ranks. Only runs once (claimed), and
 * only after the week is over. Returns the revealed row, or null if someone
 * else is revealing it or it isn't time yet.
 */
export async function revealWeek(weekStart: string, now: Date = new Date()): Promise<WeekRow | null> {
  if (now.getTime() < Date.parse(`${addWeeks(weekStart, 1)}T00:00:00Z`)) return null;
  const admin = createServiceClient();
  const { data: claimed } = await admin.from("weekly_challenges").update({ status: "revealing" })
    .eq("week_start", weekStart).eq("status", "open").select("*").maybeSingle();
  if (!claimed) return null;
  const week = claimed as WeekRow;
  try {
    const { data: entryData, error } = await admin.from("weekly_entries").select("*").eq("week_start", weekStart).limit(20000);
    if (error) throw error;
    const entries = (entryData ?? []) as EntryRow[];
    const ballots = entries.map((e) => e.ballot).filter((b): b is Ballot => !!b);
    const crowd = crowdTiers(week.items, ballots);
    const finishers = await agendaFinishers(week);
    const byUser = new Map(entries.map((e) => [e.user_id, e]));
    for (const u of finishers) if (!byUser.has(u)) byUser.set(u, { week_start: weekStart, user_id: u, ballot: null, tier_score: null, agenda_points: 0, total: null, rank: null });
    const scored = rankTotals([...byUser.values()].map((e) => {
      const tier = tierScore(week.items, e.ballot, crowd);
      const agenda = finishers.has(e.user_id) ? AGENDA_WEEK_POINTS : 0;
      return { week_start: weekStart, user_id: e.user_id, ballot: e.ballot, tier_score: e.ballot ? tier : null, agenda_points: agenda, total: tier + agenda };
    }));
    for (let i = 0; i < scored.length; i += 500) {
      const { error: upErr } = await admin.from("weekly_entries").upsert(scored.slice(i, i + 500), { onConflict: "week_start,user_id" });
      if (upErr) throw upErr;
    }
    const { data: done, error: doneErr } = await admin.from("weekly_challenges")
      .update({ status: "revealed", crowd, players: scored.length, revealed_at: now.toISOString() })
      .eq("week_start", weekStart).select("*").single();
    if (doneErr) throw doneErr;
    return done as WeekRow;
  } catch (err) {
    // Let the next reader try again.
    await admin.from("weekly_challenges").update({ status: "open" }).eq("week_start", weekStart).eq("status", "revealing");
    throw err;
  }
}

/** Reveals last week if it's still open. Cheap when there's nothing to do. */
export async function revealDue(now: Date = new Date()): Promise<void> {
  const last = addWeeks(weekOf(now), -1);
  const row = await getWeek(last);
  if (row?.status === "open") await revealWeek(last, now);
}

export interface BoardRow { rank: number; name: string; username: string | null; tierScore: number | null; agendaPoints: number; total: number }

/** A revealed week's leaderboard. Private profiles show as "A player", with no link. */
export async function leaderboard(week: string, limit = 50): Promise<BoardRow[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("weekly_entries").select("user_id, tier_score, agenda_points, total, rank")
    .eq("week_start", week).not("rank", "is", null).order("rank").limit(limit);
  const rows = (data ?? []) as { user_id: string; tier_score: number | null; agenda_points: number; total: number; rank: number }[];
  if (!rows.length) return [];
  const { data: users, error } = await admin.from("users").select("id, display_name, username, is_public").in("id", rows.map((r) => r.user_id));
  // Fail loudly: a silent miss here would show everyone as "A player".
  if (error) throw error;
  const byId = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null; is_public: boolean | null }[]).map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = byId.get(r.user_id);
    const pub = !!u?.is_public;
    return {
      rank: r.rank, name: pub ? (u?.display_name || u?.username || "A player") : "A player",
      username: pub ? u?.username ?? null : null,
      tierScore: r.tier_score, agendaPoints: r.agenda_points, total: r.total,
    };
  });
}

/** How many times an account finished a week in the top 10 (the profile badge). */
export async function topTenFinishes(userId: string): Promise<number> {
  const { count, error } = await createServiceClient().from("weekly_entries").select("week_start", { count: "exact", head: true })
    .eq("user_id", userId).lte("rank", BADGE_RANK);
  return error ? 0 : count ?? 0;
}

export type SwapResult = { ok: true; week: WeekRow } | { ok: false; error: "bad_topic" | "bad_agenda" | "has_entries" | "not_open" | "past" };

/**
 * Staff swap a week's topic and/or agenda. Next week any time; the current
 * week only before anyone has ranked it (a new topic would void their ballots)
 * or finished its agenda.
 */
export async function swapWeek(week: string, staffId: string, change: { topicId?: string; agendaCardId?: string }): Promise<SwapResult> {
  const current = weekOf();
  if (week < current) return { ok: false, error: "past" };
  const row = await ensureWeek(week);
  if (row.status !== "open") return { ok: false, error: "not_open" };
  const patch: Record<string, unknown> = { picked_by: staffId };
  if (change.topicId && change.topicId !== row.topic_id) {
    const items = weekItems(change.topicId, week);
    if (!items) return { ok: false, error: "bad_topic" };
    if (week === current && (await countEntries(week)) > 0) return { ok: false, error: "has_entries" };
    const { TIER_TOPICS } = await import("@/data/originals/tier-wars");
    patch.topic_id = change.topicId;
    patch.title = TIER_TOPICS.find((t) => t.id === change.topicId)!.label;
    patch.items = items;
  }
  if (change.agendaCardId && change.agendaCardId !== row.agenda_card_id) {
    const card = agendaCard(change.agendaCardId);
    if (!card || card.games) return { ok: false, error: "bad_agenda" };
    // Finishers are counted by card, so a mid-week swap would erase their +3.
    if (week === current && (await agendaFinishers(row)).size > 0) return { ok: false, error: "has_entries" };
    patch.agenda_card_id = change.agendaCardId;
  }
  const { data, error } = await createServiceClient().from("weekly_challenges").update(patch).eq("week_start", week).select("*").single();
  if (error) throw error;
  return { ok: true, week: data as WeekRow };
}
