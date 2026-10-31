/**
 * One Daily Duel (src/lib/originals/duel/store.ts), for the player who started it.
 *   GET                                    → { run }
 *   POST { bring: [i, …] }                 → { run }: the cards you bring (rules 4, before the lead)
 *   POST { next }                          → { run }: send out a card (the lead, or after a knockout)
 *   POST { attach, act }                   → { run }: a turn; the Energy goes on card `attach`, then
 *                                            act = { move: i } | { swap: i } | { wait: true }
 *   POST { action: "tip" }                 → { hint }: the professor's play for this turn (null between turns;
 *                                            on a rules 6 day's official duel asking ends the solo bonus)
 *   POST { tool, card?, type? }            → { run }: a Trainer Road tool from the account's bag (Easy and Normal;
 *                                            on the official duel it ends the solo bonus too)
 * Errors: 404 not_found, 409 over / busy / no_tool, 422 illegal (not allowed right now), 400 bad_request.
 * Hidden (404) in production until DUEL_PUBLIC.
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { DUEL_PUBLIC } from "@/lib/games-visibility";
import { firePlayer as duelPlayer, ipOf } from "@/lib/fireRound/player";
import { act, getRunView, tipFor, withDuelBag } from "@/lib/originals/duel/store";
import { stepOf } from "@/lib/originals/duel/steps";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const hidden = () => !DUEL_PUBLIC && process.env.NODE_ENV === "production";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (hidden()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const player = await duelPlayer(req);
  const run = player ? await getRunView(id, player) : null;
  return run ? NextResponse.json({ run: await withDuelBag(run, player) }, { headers: noStore }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (hidden()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const player = await duelPlayer(req);
  if (!player) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // A duel is up to 40 turns plus a card after each knockout; this only stops scripts.
  const { ok: under } = await rateLimit(`duel-act:${ipOf(req)}`, { max: 240, windowMs: 5 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && body.action === "tip") {
    const hint = await tipFor(id, player);
    return hint === "not_found" ? NextResponse.json({ error: "not_found" }, { status: 404 }) : NextResponse.json({ hint }, { headers: noStore });
  }
  const st = body && typeof body === "object" ? stepOf(body) : null;
  if (!st) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await act(id, player, st);
  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.error === "over" || r.error === "busy" || r.error === "no_tool" ? 409 : r.error === "illegal" ? 422 : r.error === "not_ready" ? 503 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json({ run: await withDuelBag(r.run, player) }, { headers: noStore });
}
