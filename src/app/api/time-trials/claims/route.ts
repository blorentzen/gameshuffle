/**
 * POST /api/time-trials/claims { player: "i:<id>", link, note? } → "This is me" for a player listed from the Top 10
 * sheets (picks 2026-11-04, SGSXW3sBrn6GJSinYimSnc, 4A). Signed in only; an updater or staff approve it in the queue.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { openClaim } from "@/lib/timeTrials/claims";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-claim:${actor.userId}`, { max: 10, windowMs: 24 * 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { player?: unknown; link?: unknown; note?: unknown };
  if (typeof b.player !== "string" || typeof b.link !== "string") return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const res = await openClaim({ player: b.player, userId: actor.userId, link: b.link, note: typeof b.note === "string" ? b.note : "" });
  return NextResponse.json(res, { status: res.ok ? 200 : res.error === "failed" ? 500 : 400 });
}
