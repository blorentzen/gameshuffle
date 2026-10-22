/**
 * The Daily Duel (src/lib/originals/duel/store.ts). The player is the signed-in account, else the
 * browser's guest id in x-daily-guest (as on the daily leaderboards).
 *   GET                                                → DuelHome: today's trainer, team and six, your official duel or its result, practice, streaks
 *   GET ?view=challenger                               → DuelChallengerView (today's trainer for the cards that lead into the Duel; cached a minute), or { ready: false }
 *   POST { action: "start", mode: "official" | "practice" } → { run }: the official duel (pressing Start starts its clock; asking again returns it),
 *                                                        or a practice duel once the official one is over (409 official_first before)
 *   POST { action: "board" }                           → { board }: a guest who just joined the boards puts today's finished duel on them
 * Hidden (404) in production until DUEL_PUBLIC.
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { DUEL_PUBLIC } from "@/lib/games-visibility";
import { firePlayer as duelPlayer, ipOf } from "@/lib/fireRound/player";
import { boardTodayFor, duelChallenger, duelHome, startRun } from "@/lib/originals/duel/store";
import { gsDay } from "@/lib/time/gsClock";

export const runtime = "nodejs";
/** The first request of a day may build it (a few seconds of search). */
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const hidden = () => !DUEL_PUBLIC && process.env.NODE_ENV === "production";

export async function GET(req: Request) {
  if (hidden()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (new URL(req.url).searchParams.get("view") === "challenger") {
    const c = await duelChallenger(gsDay()).catch(() => null);
    return NextResponse.json(c ? { ready: true, ...c } : { ready: false }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  }
  const player = await duelPlayer(req);
  return NextResponse.json(await duelHome(player), { headers: noStore });
}

export async function POST(req: Request) {
  if (hidden()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const player = await duelPlayer(req);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 400 });
  const { ok: under } = await rateLimit(`duel-start:${ipOf(req)}`, { max: 40, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; mode?: string };
  if (body.action === "board") return NextResponse.json({ board: await boardTodayFor(player) }, { headers: noStore });
  if (body.action !== "start" || (body.mode !== "official" && body.mode !== "practice")) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await startRun(player, body.mode);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_ready" ? 503 : r.error === "official_first" ? 409 : 500 });
  return NextResponse.json({ run: r.run }, { headers: noStore });
}
