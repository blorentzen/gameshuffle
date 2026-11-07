import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendDailyNudge } from "@/lib/social/nudges";
import { rateLimit } from "@/lib/ratelimit";
import type { BoardGame } from "@/lib/daily/boardRules";

/**
 * POST { to, game }: nudge a friend about today's daily (dailies picks 2026-11-05, 3A). Friends only, once a day each;
 * the notice carries your result when you've played. Errors: not_friends, blocked, already_played, already_nudged.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { ok } = await rateLimit(`nudge:${user.id}`, { max: 20, windowMs: 60 * 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { to?: unknown; game?: unknown };
  const to = typeof body.to === "string" ? body.to : "";
  const game = typeof body.game === "string" ? (body.game as BoardGame) : ("" as BoardGame);
  if (!to || !game) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await sendDailyNudge(user.id, to, game).catch(() => null);
  if (!r) return NextResponse.json({ error: "failed" }, { status: 500 });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.error === "already_nudged" || r.error === "already_played" ? 409 : 403 });
}
