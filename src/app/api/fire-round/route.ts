/**
 * Fire Round (src/lib/fireRound/store.ts). The player is the signed-in
 * account, else the browser's guest id in x-daily-guest.
 *   GET                                            → the page's opening state (categories, today's round, streak, bests, a round in progress)
 *   POST { action: "start", mode: "daily" | "free", category?, length? }  → a new round (or today's, picked back up)
 *   POST { action: "board" }                       → a guest who just joined the boards: today's finished round goes on them
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { boardTodayFor, fireHome, startRun } from "@/lib/fireRound/store";
import { firePlayer, ipOf } from "@/lib/fireRound/player";
import { isFireLength } from "@/lib/originals/fireRound";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const player = await firePlayer(req);
  return NextResponse.json({ ...(await fireHome(player)), signedIn: player?.kind === "u" }, { headers: noStore });
}

export async function POST(req: Request) {
  const player = await firePlayer(req);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 400 });
  const { ok: under } = await rateLimit(`fire-start:${ipOf(req)}`, { max: 40, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; mode?: string; category?: string; length?: string };
  if (body.action === "board") return NextResponse.json({ board: await boardTodayFor(player) }, { headers: noStore });
  if (body.action !== "start" || (body.mode !== "daily" && body.mode !== "free")) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await startRun(player, {
    mode: body.mode,
    category: typeof body.category === "string" ? body.category : undefined,
    length: isFireLength(body.length) ? body.length : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_ready" ? 503 : r.error === "no_questions" ? 409 : 500 });
  return NextResponse.json({ run: r.run }, { headers: noStore });
}
