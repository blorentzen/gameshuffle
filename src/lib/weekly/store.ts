/**
 * The Weekly Challenge store (service role). Rules live in
 * src/lib/originals/weekly.ts; this file reads and writes weekly_challenges
 * and weekly_entries (supabase/weekly-challenge-m1.sql).
 *
 * Weeks are created on first read (the automatic pick) and revealed lazily:
 * the first read after Monday 00:00 UTC reveals last week, and the Monday cron
 * does the same so it happens even on a quiet morning. The reveal claims the
 * row (open → revealing) so two readers can't score it twice.
 *
 * Survey weeks (weekly-survey-m1): the week is a Chat Brain question. A week
 * staff scheduled is used as is; otherwise the oldest family-safe question in
 * the Chat Brain queue (status 'draft') is claimed and opened for the week; if
 * the queue is empty, the week falls back to a Tier War. At the reveal the
 * question's board is used if staff published it, otherwise it's grouped
 * automatically (spelling, then Claude) and published, and each player's
 * predictions are scored against it.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { AGENDA_CARDS } from "@/data/originals/agendas";
import {
  AGENDA_WEEK_POINTS, BADGE_RANK, addWeeks, autoPick, cleanWeeklyBallot, crowdTiers, rankTotals, tierScore, weekItems, weekOf,
  type WeeklyItem,
} from "@/lib/originals/weekly";
import type { Ballot } from "@/lib/originals/tierWars";
import { SURVEY_PREDICTIONS, cleanPredictions, scorePredictions } from "@/lib/originals/weekly";
import { upsertUserAnswer } from "@/lib/chatbrain/store";
import type { BoardAnswer } from "@/lib/chatbrain/rules";

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
  kind?: "tier" | "survey";
  prompt_id?: string | null;
  board?: BoardAnswer[] | null;
}

export interface EntryRow {
  week_start: string;
  user_id: string;
  ballot: Ballot | null;
  tier_score: number | null;
  agenda_points: number;
  total: number | null;
  rank: number | null;
  answer?: string | null;
  predictions?: string[] | null;
  survey_score?: number | null;
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

/**
 * Claims the oldest family-safe public question waiting in the Chat Brain queue
 * and opens it for this week. Null if the queue is empty (or Chat Brain isn't set up).
 */
async function claimSurveyQuestion(week: string): Promise<{ id: string; text: string } | null> {
  const admin = createServiceClient();
  for (let i = 0; i < 3; i++) {
    const { data } = await admin.from("brain_prompts").select("id, text").eq("status", "draft").eq("family_safe", true)
      .is("community_id", null).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const q = data as { id: string; text: string } | null;
    if (!q) return null;
    const { data: claimed } = await admin.from("brain_prompts").update({
      status: "collecting", opens_at: `${week}T00:00:00Z`, closes_at: `${addWeeks(week, 1)}T00:00:00Z`, updated_at: new Date().toISOString(),
    }).eq("id", q.id).eq("status", "draft").select("id").maybeSingle();
    if (claimed) return q;
  }
  return null;
}

/** The week's row, creating it on first use: a survey from the Chat Brain queue, or a Tier War. */
export async function ensureWeek(week: string): Promise<WeekRow> {
  const have = await getWeek(week);
  if (have) return have;
  const pick = autoPick(week);
  const question = await claimSurveyQuestion(week).catch(() => null);
  if (question) {
    const { error } = await createServiceClient().from("weekly_challenges").upsert({
      week_start: week, topic_id: "survey", title: question.text, items: [], agenda_card_id: pick.agendaCardId, kind: "survey", prompt_id: question.id,
    }, { onConflict: "week_start", ignoreDuplicates: true });
    const now = error ? null : await getWeek(week);
    if (now?.prompt_id === question.id) return now;
    // Someone else created the week first: hand the question back to the queue.
    await createServiceClient().from("brain_prompts").update({ status: "draft", opens_at: null, closes_at: null }).eq("id", question.id).eq("status", "collecting");
    if (now) return now;
  }
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

export type SaveSurveyResult = { ok: true; answer: string; predictions: string[] } | { ok: false; error: "closed" | "not_survey" | "bad_entry" | "blocked" };

/** Saves (or changes) a player's own answer and their predictions for this week's survey. */
export async function saveSurvey(userId: string, rawAnswer: unknown, rawPredictions: unknown): Promise<SaveSurveyResult> {
  const week = await ensureWeek(weekOf());
  if (week.kind !== "survey" || !week.prompt_id) return { ok: false, error: "not_survey" };
  if (week.status !== "open") return { ok: false, error: "closed" };
  const answer = typeof rawAnswer === "string" ? rawAnswer.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  const predictions = cleanPredictions(rawPredictions);
  if (!answer || !predictions || predictions.length !== SURVEY_PREDICTIONS) return { ok: false, error: "bad_entry" };
  const { isBlockedText } = await import("@/lib/text/filter");
  if (predictions.some(isBlockedText)) return { ok: false, error: "blocked" };
  const a = await upsertUserAnswer({ promptId: week.prompt_id, userId, raw: answer, source: "weekly" });
  if (!a.ok) return { ok: false, error: a.error === "blocked" ? "blocked" : a.error === "closed" ? "closed" : "bad_entry" };
  const { error } = await createServiceClient().from("weekly_entries").upsert(
    { week_start: week.week_start, user_id: userId, answer, predictions, updated_at: new Date().toISOString() },
    { onConflict: "week_start,user_id" },
  );
  if (error) throw error;
  return { ok: true, answer, predictions };
}

/** The week's board for a survey: staff's published board, else grouped automatically now. */
async function surveyBoard(promptId: string): Promise<BoardAnswer[]> {
  const admin = createServiceClient();
  const have = await admin.from("brain_boards").select("answers").eq("prompt_id", promptId).maybeSingle();
  if (have.data) return (have.data as { answers: BoardAnswer[] }).answers;
  const { reviewData, aiGroups, publish } = await import("@/lib/chatbrain/review");
  const ai = await aiGroups(promptId).catch(() => null);
  let groups: { label: string; keys: string[] }[];
  if (ai?.ok) groups = ai.groups;
  else {
    const r = await reviewData(promptId);
    groups = (r?.groups ?? []).map((g) => ({ label: g.label, keys: g.keys }));
  }
  const pub = await publish(promptId, groups, null);
  return pub.ok ? pub.board : [];
}

export async function getEntry(week: string, userId: string): Promise<EntryRow | null> {
  const { data } = await createServiceClient().from("weekly_entries").select("*").eq("week_start", week).eq("user_id", userId).maybeSingle();
  return (data as EntryRow | null) ?? null;
}

export async function countEntries(week: string): Promise<number> {
  const { count } = await createServiceClient().from("weekly_entries").select("user_id", { count: "exact", head: true })
    .eq("week_start", week).or("ballot.not.is.null,predictions.not.is.null");
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
    const finishers = await agendaFinishers(week);
    if (week.kind === "survey" && week.prompt_id) {
      // Close the question to new answers, then build (or use) its board.
      await admin.from("brain_prompts").update({ status: "review", updated_at: now.toISOString() }).eq("id", week.prompt_id).eq("status", "collecting");
      const board = await surveyBoard(week.prompt_id);
      const byUser = new Map(entries.map((e) => [e.user_id, e]));
      for (const u of finishers) if (!byUser.has(u)) byUser.set(u, { week_start: weekStart, user_id: u, ballot: null, tier_score: null, agenda_points: 0, total: null, rank: null });
      const scored = rankTotals([...byUser.values()].map((e) => {
        const survey = scorePredictions(e.predictions ?? null, board).points;
        const agenda = finishers.has(e.user_id) ? AGENDA_WEEK_POINTS : 0;
        return { week_start: weekStart, user_id: e.user_id, survey_score: e.predictions ? survey : null, agenda_points: agenda, total: survey + agenda };
      }));
      for (let i = 0; i < scored.length; i += 500) {
        const { error: upErr } = await admin.from("weekly_entries").upsert(scored.slice(i, i + 500), { onConflict: "week_start,user_id" });
        if (upErr) throw upErr;
      }
      const { data: done, error: doneErr } = await admin.from("weekly_challenges")
        .update({ status: "revealed", board, players: scored.length, revealed_at: now.toISOString() })
        .eq("week_start", weekStart).select("*").single();
      if (doneErr) throw doneErr;
      return done as WeekRow;
    }
    const ballots = entries.map((e) => e.ballot).filter((b): b is Ballot => !!b);
    const crowd = crowdTiers(week.items, ballots);
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

export interface BoardRow { rank: number; name: string; username: string | null; tierScore: number | null; surveyScore: number | null; agendaPoints: number; total: number }

/** A revealed week's leaderboard. Private profiles show as "A player", with no link. */
export async function leaderboard(week: string, limit = 50): Promise<BoardRow[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("weekly_entries").select("user_id, tier_score, survey_score, agenda_points, total, rank")
    .eq("week_start", week).not("rank", "is", null).order("rank").limit(limit);
  const rows = (data ?? []) as { user_id: string; tier_score: number | null; survey_score: number | null; agenda_points: number; total: number; rank: number }[];
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
      tierScore: r.tier_score, surveyScore: r.survey_score ?? null, agendaPoints: r.agenda_points, total: r.total,
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

export type ScheduleResult = { ok: true; week: WeekRow } | { ok: false; error: "past" | "taken" | "not_found" | "not_draft" | "has_entries" };

/**
 * Staff: make a week a survey with a specific Chat Brain question. Next week any
 * time (it replaces an automatic pick); the current week only before anyone has
 * played it. The question must be waiting in the queue (status 'draft').
 */
export async function scheduleSurvey(week: string, promptId: string, staffId: string): Promise<ScheduleResult> {
  const current = weekOf();
  if (week < current) return { ok: false, error: "past" };
  const admin = createServiceClient();
  const { data: q } = await admin.from("brain_prompts").select("id, text, status").eq("id", promptId).maybeSingle();
  if (!q) return { ok: false, error: "not_found" };
  if ((q as { status: string }).status !== "draft") return { ok: false, error: "not_draft" };
  const row = await getWeek(week);
  if (row && week === current && (await countEntries(week)) > 0) return { ok: false, error: "has_entries" };
  // Hand back any question the week had claimed.
  if (row?.prompt_id && row.prompt_id !== promptId) {
    await admin.from("brain_prompts").update({ status: "draft", opens_at: null, closes_at: null }).eq("id", row.prompt_id).eq("status", "collecting");
  }
  await admin.from("brain_prompts").update({ status: "collecting", opens_at: `${week}T00:00:00Z`, closes_at: `${addWeeks(week, 1)}T00:00:00Z`, updated_at: new Date().toISOString() }).eq("id", promptId);
  const agenda = row?.agenda_card_id ?? autoPick(week).agendaCardId;
  const { data, error } = await admin.from("weekly_challenges").upsert({
    week_start: week, topic_id: "survey", title: (q as { text: string }).text, items: [], agenda_card_id: agenda,
    kind: "survey", prompt_id: promptId, picked_by: staffId,
  }, { onConflict: "week_start" }).select("*").single();
  if (error) return { ok: false, error: "taken" };
  return { ok: true, week: data as WeekRow };
}
