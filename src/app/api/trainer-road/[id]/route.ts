/**
 * One Trainer Road duel (src/lib/originals/duel/roadStore.ts), for the player who started it.
 *   GET                         → { run }
 *   POST { bring } | { next } | { attach, act, use? } → { run } (the same steps as the Daily Duel's)
 *   POST { action: "tip" }      → { hint } (asking ends this run's solo bonus; none in Hard)
 * Errors: 404 not_found, 409 over / busy, 422 illegal, 400 bad_request, 503 not_ready.
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { roadShown } from "@/lib/games-visibility";
import { firePlayer, ipOf } from "@/lib/fireRound/player";
import { getRoadRunView, roadAct, roadTip } from "@/lib/originals/duel/roadStore";
import { stepOf } from "@/lib/originals/duel/steps";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!roadShown()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const player = await firePlayer(req);
  const run = player ? await getRoadRunView(id, player) : null;
  return run ? NextResponse.json({ run }, { headers: noStore }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!roadShown()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const player = await firePlayer(req);
  if (!player) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { ok: under } = await rateLimit(`road-act:${ipOf(req)}`, { max: 300, windowMs: 5 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && body.action === "tip") {
    const hint = await roadTip(id, player);
    return hint === "not_found" ? NextResponse.json({ error: "not_found" }, { status: 404 }) : NextResponse.json({ hint }, { headers: noStore });
  }
  const st = body && typeof body === "object" ? stepOf(body) : null;
  if (!st) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await roadAct(id, player, st);
  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.error === "over" || r.error === "busy" ? 409 : r.error === "illegal" ? 422 : 503;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json({ run: r.run }, { headers: noStore });
}
