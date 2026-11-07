import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { spaceById, spaceOpen } from "@/lib/games/spaces";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";
import { rateLimit } from "@/lib/ratelimit";
import { keyFromPublicUrl } from "@/lib/storage/r2";
import { siteActor } from "@/lib/timeTrials/players";
import { cleanLaps, parseTime } from "@/lib/timeTrials/rules";
import { readFrom } from "@/lib/timeTrials/proof";
import { addChallengeClip, addChallengeTime } from "@/lib/spaces/spaceTt";

export const runtime = "nodejs";

/**
 * POST /api/games/<space>/tt (signed in): Mario Kart's time trial challenges.
 *   { kind: "day" | "week", track, time, proofUrl, readToken, laps? }: a challenge time, with the result screenshot
 *     uploaded through /api/time-trials/read (required, as on the boards).
 *   { action: "clip", entryId, url }: the clip for a top place, into the review queue.
 * A space that hasn't opened is staff only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ space: string }> }) {
  const s = spaceById((await params).space);
  if (!s || !s.tt) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const actor = await siteActor();
  if (!actor || !actor.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const userId = actor.userId;
  if (!spaceOpen(s, gsDay())) {
    const role = ((await createServiceClient().from("users").select("role").eq("id", userId).maybeSingle()).data as { role: string | null } | null)?.role ?? null;
    if (!isStaffRole(role)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!(await rateLimit(`space-tt:${actor.player}`, { max: 30, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; kind?: unknown; track?: unknown; time?: unknown; proofUrl?: unknown; readToken?: unknown; laps?: unknown; entryId?: unknown; url?: unknown };

  if (body.action === "clip") {
    if (typeof body.entryId !== "string" || typeof body.url !== "string") return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    const r = await addChallengeClip(userId, actor.player, body.entryId, body.url);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  if (body.kind !== "day" && body.kind !== "week") return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const track = typeof body.track === "string" ? body.track : "";
  const timeMs = typeof body.time === "number" ? Math.round(body.time) : parseTime(String(body.time ?? ""));
  if (!timeMs || timeMs < 30_000 || timeMs > 600_000) return NextResponse.json({ ok: false, error: "bad_time" }, { status: 400 });
  if (typeof body.proofUrl !== "string" || !body.proofUrl) return NextResponse.json({ ok: false, error: "screenshot_required" }, { status: 400 });
  const key = keyFromPublicUrl(body.proofUrl);
  if (!key || !key.startsWith(`time-trials/${userId}/`)) return NextResponse.json({ ok: false, error: "bad_proof" }, { status: 400 });
  const read = readFrom(body.readToken, body.proofUrl);
  const laps = body.laps == null ? read?.laps ?? null : cleanLaps(body.laps);
  const r = await addChallengeTime({
    s, kind: body.kind, userId, player: actor.player, track, timeMs, proofUrl: body.proofUrl, laps,
    read: read ? { timeMs: read.timeMs ?? null, laps: read.laps ?? null, parts: read.parts ?? null } : null,
  });
  if (!r.ok) return NextResponse.json(r, { status: r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json(r);
}
