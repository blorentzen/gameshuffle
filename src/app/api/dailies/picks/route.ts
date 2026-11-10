/**
 * Your dailies (choose your dailies, 2026-11-09; src/lib/originals/dailyPicks.ts):
 *   GET → { signedIn, picks, chosen, canChoose }  (signed out: the default four, canChoose false)
 *   PUT { picks: string[] } → the same, saved. 401 signed out, 400 `at_least_one`, 503 `not_ready` before
 *   daily-picks-m1.sql runs.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dailyPicksState, saveDailyPicks } from "@/lib/originals/dailyPicks";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function who() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET() {
  const user = await who();
  const state = await dailyPicksState(user?.id ?? null);
  return NextResponse.json({ signedIn: !!user, ...state }, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "signin" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { picks?: unknown };
  if (!Array.isArray(body.picks)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  const res = await saveDailyPicks(user.id, body.picks);
  if (!res.ok) {
    const status = res.error === "at_least_one" ? 400 : res.error === "not_ready" ? 503 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, signedIn: true, ...res.state }, { headers: NO_STORE });
}
