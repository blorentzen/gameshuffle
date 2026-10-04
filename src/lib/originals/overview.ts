import "server-only";

/**
 * Platform ▸ Originals: one read of how the daily games are doing, for staff.
 *
 *   chatBrain  questions by status, launch progress, answers (total / 24h / 7d)
 *              and where they came from, the collecting questions furthest
 *              from a board, how many are ready for review, Founding Brains,
 *              bank questions not yet added
 *   daily      today and the next 7 days (game, answer, clue present), signed-in
 *              plays for the last 7 days, characters missing facts or a clue
 *   weekly     this week and next (kind, question, players), last week's top 3
 *
 * Each section fails on its own: a missing table shows that section as not
 * ready instead of breaking the page.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { CHAT_BRAIN_BANK } from "@/data/originals/chat-brain-questions";
import { FOUNDING_BRAIN_ANSWERS, LAUNCH_BOARDS, questionKey } from "@/lib/chatbrain/rules";
import { updatesConfigured } from "@/lib/chatbrain/updates";
import { PUZZLES, answerFor, dayKey, puzzleFor, puzzleNumber } from "@/lib/originals/daily";
import { addWeeks, weekNumber, weekOf } from "@/lib/originals/weekly";
import { countEntries, ensureWeek, leaderboard } from "@/lib/weekly/store";

const STATUSES = ["draft", "collecting", "review", "published", "retired"] as const;

export interface DailyDay { day: string; number: number; game: string; answer: string; clue: boolean; img: string }

export interface OriginalsOverview {
  chatBrain: null | {
    statuses: Record<string, number>;
    boards: number; goal: number;
    answers: { total: number; day: number; week: number };
    sources: { source: string; count: number }[];
    collecting: { id: string; text: string; category: string; answers: number; min: number }[];
    readyForReview: number;
    foundingBrains: number;
    bankLeft: number;
    updatesConfigured: boolean;
  };
  daily: {
    today: DailyDay;
    upcoming: DailyDay[];
    plays: { day: string; players: number; solved: number; avgGuesses: number | null }[] | null;
    missing: { game: string; name: string; what: "facts" | "clue" }[];
  };
  weekly: null | {
    weeks: { label: string; number: number; kind: string; title: string; players: number; swapped: boolean }[];
    last: { number: number; top: { name: string; total: number }[] } | null;
  };
}

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function dailyDay(day: string): DailyDay {
  const p = puzzleFor(day), a = answerFor(day);
  return { day, number: puzzleNumber(day), game: p.game, answer: a.name, clue: !!a.clue, img: a.img };
}

async function chatBrain(): Promise<OriginalsOverview["chatBrain"]> {
  const svc = createServiceClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [prompts, boards, total, day, recent, users] = await Promise.all([
    svc.from("brain_prompts").select("id, text, category, status, min_answers").is("community_id", null).limit(5000),
    svc.from("brain_boards").select("prompt_id, brain_prompts!inner(community_id)", { count: "exact", head: true }).eq("segment", "all").eq("edition", 1).is("brain_prompts.community_id", null),
    svc.from("brain_answers").select("id", { count: "exact", head: true }).eq("hidden", false),
    svc.from("brain_answers").select("id", { count: "exact", head: true }).eq("hidden", false).gte("created_at", dayAgo),
    svc.from("brain_answers").select("source, prompt_id").gte("created_at", weekAgo).limit(50_000),
    svc.from("brain_answers").select("user_id").not("user_id", "is", null).limit(100_000),
  ]);
  if (prompts.error) return null;
  const rows = (prompts.data ?? []) as { id: string; text: string; category: string; status: string; min_answers: number }[];
  const statuses: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) statuses[r.status] = (statuses[r.status] ?? 0) + 1;

  const sourceCount = new Map<string, number>();
  for (const r of (recent.data ?? []) as { source: string }[]) sourceCount.set(r.source, (sourceCount.get(r.source) ?? 0) + 1);

  // Answer counts for collecting questions (all time).
  const collectingRows = rows.filter((r) => r.status === "collecting");
  const counts = new Map<string, number>();
  if (collectingRows.length) {
    const { data } = await svc.from("brain_answers").select("prompt_id").in("prompt_id", collectingRows.map((r) => r.id)).eq("hidden", false).limit(50_000);
    for (const a of (data ?? []) as { prompt_id: string }[]) counts.set(a.prompt_id, (counts.get(a.prompt_id) ?? 0) + 1);
  }
  const collecting = collectingRows
    .map((r) => ({ id: r.id, text: r.text, category: r.category, answers: counts.get(r.id) ?? 0, min: r.min_answers }))
    .sort((a, b) => a.answers / a.min - b.answers / b.min);

  const perUser = new Map<string, number>();
  for (const a of (users.data ?? []) as { user_id: string }[]) perUser.set(a.user_id, (perUser.get(a.user_id) ?? 0) + 1);
  const have = new Set(rows.map((r) => questionKey(r.text)));

  return {
    statuses,
    boards: boards.count ?? 0, goal: LAUNCH_BOARDS,
    answers: { total: total.count ?? 0, day: day.count ?? 0, week: (recent.data ?? []).length },
    sources: [...sourceCount.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    collecting: collecting.slice(0, 10),
    readyForReview: collecting.filter((c) => c.answers >= c.min).length,
    foundingBrains: [...perUser.values()].filter((n) => n >= FOUNDING_BRAIN_ANSWERS).length,
    bankLeft: CHAT_BRAIN_BANK.filter((q) => !have.has(questionKey(q.text))).length,
    updatesConfigured: updatesConfigured(),
  };
}

async function daily(): Promise<OriginalsOverview["daily"]> {
  const today = dayKey();
  const from = shiftDay(today, -6);
  const { data, error } = await createServiceClient().from("daily_results").select("day, guesses, solved").gte("day", from).limit(50_000);
  let plays: OriginalsOverview["daily"]["plays"] = null;
  if (!error) {
    const byDay = new Map<string, { players: number; solved: number; guesses: number }>();
    for (const r of (data ?? []) as { day: string; guesses: number; solved: boolean }[]) {
      const d = byDay.get(r.day) ?? { players: 0, solved: 0, guesses: 0 };
      d.players += 1;
      if (r.solved) { d.solved += 1; d.guesses += r.guesses; }
      byDay.set(r.day, d);
    }
    plays = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6)).map((day) => {
      const d = byDay.get(day);
      return { day, players: d?.players ?? 0, solved: d?.solved ?? 0, avgGuesses: d?.solved ? Math.round((d.guesses / d.solved) * 10) / 10 : null };
    });
  }
  const missing: OriginalsOverview["daily"]["missing"] = [];
  for (const p of Object.values(PUZZLES)) {
    for (const c of p.characters) {
      if (c.traits.some((t) => t === null)) missing.push({ game: p.game, name: c.name, what: "facts" });
      else if (!c.clue) missing.push({ game: p.game, name: c.name, what: "clue" });
    }
  }
  return {
    today: dailyDay(today),
    upcoming: Array.from({ length: 7 }, (_, i) => dailyDay(shiftDay(today, i + 1))),
    plays,
    missing,
  };
}

async function weekly(): Promise<OriginalsOverview["weekly"]> {
  try {
    const now = weekOf();
    const [cur, next] = await Promise.all([ensureWeek(now), ensureWeek(addWeeks(now, 1))]);
    const [curPlayers, nextPlayers, top] = await Promise.all([countEntries(cur.week_start), countEntries(next.week_start), leaderboard(addWeeks(now, -1), 3)]);
    const describe = (label: string, r: typeof cur, players: number) => ({
      label, number: weekNumber(r.week_start), kind: r.kind ?? "tier", title: r.title, players, swapped: !!r.picked_by,
    });
    return {
      weeks: [describe("This week", cur, curPlayers), describe("Next week", next, nextPlayers)],
      last: top.length ? { number: weekNumber(addWeeks(now, -1)), top: top.map((t) => ({ name: t.name, total: t.total })) } : null,
    };
  } catch {
    return null;
  }
}

export async function originalsOverview(): Promise<OriginalsOverview> {
  const [cb, d, w] = await Promise.all([chatBrain().catch(() => null), daily(), weekly()]);
  return { chatBrain: cb, daily: d, weekly: w };
}
