/**
 * /api/levels/<id>: one level on a board (signed in).
 *
 *   POST { action: "mark", outcome: cleared | gave_up | no_load | null }   a player's mark (levels, not seeds)
 *        { action: "like", liked: boolean }
 *        { action: "report", reason: wrong_game | offensive | spam }      Platform ▸ Moderation; three hide it
 *        { action: "pin", note } | { action: "unpin" }                    staff: a GameShuffle pick
 *        { action: "week" }                                               staff: the level of the week
 *        { action: "queue" }                                              GS Pro: into your level queue
 *        → { level } (or { report } / { queued })
 *   DELETE  take it off its board (the player who shared it, or staff)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { removeLevel } from "@/lib/levels/store";
import { likeLevel, markLevel, pickWeek, pinLevel, queueLevel, reportLevel } from "@/lib/levels/curation";
import { isLevelReport, isMarkOutcome } from "@/lib/levels/rules";

export const runtime = "nodejs";

const STATUS: Record<string, number> = { not_ready: 503, not_found: 404, staff_only: 403, pro_required: 403, own_level: 400, bad_request: 400, bad_note: 400, picks_full: 409, rate_limited: 429, suspended: 403 };

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!(await rateLimit(`level-act:${userId}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const fail = (error: string, line?: string) => NextResponse.json({ error, ...(line ? { line } : {}) }, { status: STATUS[error] ?? 400 });

  switch (body.action) {
    case "mark": {
      const outcome = body.outcome == null ? null : isMarkOutcome(body.outcome) ? body.outcome : undefined;
      if (outcome === undefined) return fail("bad_request");
      const r = await markLevel(userId, id, outcome);
      return r.ok ? NextResponse.json({ level: r.card }) : fail(r.error, r.line);
    }
    case "like": {
      const r = await likeLevel(userId, id, body.liked === true);
      return r.ok ? NextResponse.json({ level: r.card }) : fail(r.error, r.line);
    }
    case "report": {
      if (!isLevelReport(body.reason)) return fail("bad_request");
      const r = await reportLevel(userId, id, body.reason);
      return r.ok ? NextResponse.json({ report: r }) : fail(r.error);
    }
    case "pin":
    case "unpin": {
      const r = await pinLevel(userId, id, body.action === "unpin" ? null : String(body.note ?? ""));
      return r.ok ? NextResponse.json({ level: r.card }) : fail(r.error, r.line);
    }
    case "week": {
      const r = await pickWeek(userId, id);
      return r.ok ? NextResponse.json({ level: r.card }) : fail(r.error, r.line);
    }
    case "queue": {
      const r = await queueLevel(userId, id);
      return "error" in r ? fail(r.error) : NextResponse.json({ queued: r });
    }
    default:
      return fail("bad_request");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const ok = await removeLevel(userId, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
