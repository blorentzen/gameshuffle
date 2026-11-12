/**
 * A trainer battle in a room (battle picks 2026-11-11).
 *   GET  /api/races/<code>/battle            the battle as the viewer sees it ({ run }: a player's side, or a watcher's)
 *   GET  /api/races/<code>/battle?teams=1    the teams the room's group offers (the lobby's picker)
 *   POST /api/races/<code>/battle            a player's step: { bring: [3 card indexes] }, { lead }, { next }, or a turn
 *                                            { attach, act, use } (the Daily Duel arena's steps); answers { run }
 * Reads check the clock (a turn that ran out plays itself), so both players polling keeps the battle moving.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { cleanCode } from "@/lib/versus/rules";
import { roomByCode } from "@/lib/versus/store";
import { battleGroupOf, battleReady, battleRunView, battleStep, teamsFor, type BattleStepBody } from "@/lib/versus/battle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code || !(await battleReady())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const room = await roomByCode(code);
  if (!room || room.kind !== "battle") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (req.nextUrl.searchParams.get("teams") === "1") {
    return NextResponse.json({ teams: teamsFor(battleGroupOf(room)) }, { headers: { "cache-control": "public, max-age=300" } });
  }
  const run = await battleRunView(room, await viewer());
  if (!run) return NextResponse.json({ error: "not_started" }, { status: 404 });
  return NextResponse.json({ run }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code || !(await battleReady())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const limited = await rateLimit(`races:battle:${userId}`, { max: 60, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const room = await roomByCode(code);
  if (!room || room.kind !== "battle") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as BattleStepBody | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await battleStep(room, userId, body);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "illegal" ? 422 : res.error === "not_found" || res.error === "not_in" ? 404 : 409 });
  return NextResponse.json({ run: res.run });
}
