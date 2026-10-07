/**
 * The Daily Shuffle, account results.
 *   GET  → { signedIn, stats, today } for the signed-in account (stats derived from daily_results,
 *          across every puzzle in the weekday rotation: one streak, whatever the day's game)
 *   POST { day, guesses } → records a finished game once. The server re-judges the
 *        guesses against the day's answer, so a result can't be made up.
 * Signed-out players keep playing with browser-only streaks.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { dayKey, judgeGame, puzzleFor, statsFrom } from "@/lib/originals/daily";

export const runtime = "nodejs";

async function loadStats(userId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("daily_results")
    .select("day, puzzle, guesses, solved")
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as { day: string; puzzle: string; guesses: number; solved: boolean }[];
  const today = dayKey();
  return { stats: statsFrom(rows, today), today: rows.find((r) => r.day === today) ?? null };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false });
  try {
    return NextResponse.json({ signedIn: true, ...(await loadStats(user.id)) });
  } catch (err) {
    console.error("[daily] stats failed:", err);
    return NextResponse.json({ signedIn: true, stats: null, today: null });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { day?: unknown; guesses?: unknown } | null;
  const today = dayKey();
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const day = typeof body?.day === "string" ? body.day : today;
  // Yesterday is allowed so a game finished just after midnight Pacific still counts.
  if (day !== today && day !== yesterday) return NextResponse.json({ error: "wrong_day" }, { status: 400 });
  const guesses = Array.isArray(body?.guesses) ? body.guesses.filter((g): g is string => typeof g === "string") : [];
  const result = judgeGame(day, guesses);
  if (!result) return NextResponse.json({ error: "not_a_finished_game" }, { status: 400 });

  const admin = createServiceClient();
  // First result for the day stands, whatever the puzzle; replaying on another
  // device (or across the day the rotation changed) doesn't add a second one.
  const { data: existing } = await admin.from("daily_results").select("day").eq("user_id", user.id).eq("day", day).limit(1);
  if (existing && existing.length) return NextResponse.json({ ok: true, ...(await loadStats(user.id)) });
  const { error } = await admin
    .from("daily_results")
    .upsert({ user_id: user.id, day, puzzle: puzzleFor(day).id, guesses: result.guesses, solved: result.solved }, { onConflict: "user_id,day,puzzle", ignoreDuplicates: true });
  if (error) {
    console.error("[daily] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(await loadStats(user.id)) });
}
