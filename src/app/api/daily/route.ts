/**
 * The Daily Shuffle, account results.
 *   GET  → { signedIn, stats, today } for the signed-in account (stats derived from daily_results,
 *          across every puzzle in the weekday rotation: one streak, whatever the day's game).
 *          Results played in the Discord Activity by the Discord user this account signs in
 *          with count too (src/lib/daily/results.ts).
 *   POST { day, guesses } → records a finished game once. The server re-judges the
 *        guesses against the day's answer, so a result can't be made up.
 * Signed-out players keep playing with browser-only streaks.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dailyView, saveAccountResult } from "@/lib/daily/results";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false });
  try {
    const { stats, today } = await dailyView({ userId: user.id });
    return NextResponse.json({ signedIn: true, stats, today });
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
  const saved = await saveAccountResult(user.id, body?.day, body?.guesses);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.error === "save_failed" ? 500 : 400 });
  const { stats, today } = await dailyView({ userId: user.id });
  return NextResponse.json({ ok: true, stats, today });
}
