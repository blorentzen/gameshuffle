/**
 * The Daily Shuffle, account results.
 *   GET  → { signedIn, stats, today, times } for the signed-in account (times = { seconds, fastest }: today's solve time and the best) (stats derived from daily_results,
 *          across every puzzle in the weekday rotation: one streak, whatever the day's game).
 *          Results played in the Discord Activity by the Discord user this account signs in
 *          with count too (src/lib/daily/results.ts).
 *   POST { day, guesses } → records a finished game once. The server re-judges the
 *        guesses against the day's answer, so a result can't be made up.
 * Signed-out players keep playing with browser-only streaks.
 * `?game=dex` does the same for the Daily Dex (its own results and streak).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dailyView, saveAccountResult } from "@/lib/daily/results";
import { timesFor } from "@/lib/daily/boards";
import { guestKey, validGuestSecret } from "@/lib/daily/guests";
import { SHUFFLE, dayKey } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";

export const runtime = "nodejs";

/** The game a request is for: the Daily Dex with ?game=dex, else the Daily Shuffle. */
const gameOf = (req: Request) => (new URL(req.url).searchParams.get("game") === "dex" ? DEX : SHUFFLE);

export async function GET(req: Request) {
  const game = gameOf(req);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false });
  try {
    const [{ stats, today }, times] = await Promise.all([dailyView({ userId: user.id }, game), timesFor(`u:${user.id}`, game.id, dayKey()).catch(() => null)]);
    return NextResponse.json({ signedIn: true, stats, today, times });
  } catch (err) {
    console.error("[daily] stats failed:", err);
    return NextResponse.json({ signedIn: true, stats: null, today: null });
  }
}

export async function POST(req: Request) {
  const game = gameOf(req);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { day?: unknown; guesses?: unknown } | null;
  // This browser's guest id: when the Start went out before sign-in had loaded, the clock is there.
  const secret = req.headers.get("x-daily-guest");
  const guestStart = validGuestSecret(secret) ? `g:${guestKey(secret)}` : null;
  const saved = await saveAccountResult(user.id, body?.day, body?.guesses, game, guestStart);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.error === "save_failed" ? 500 : 400 });
  const [{ stats, today }, times] = await Promise.all([dailyView({ userId: user.id }, game), timesFor(`u:${user.id}`, game.id, dayKey()).catch(() => null)]);
  return NextResponse.json({ ok: true, stats, today, score: saved.score ?? null, times });
}
