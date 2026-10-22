/**
 * One Daily Duel (src/lib/originals/duel/store.ts), for the player who started it.
 *   GET                                    → { run }
 *   POST { next }                          → { run }: send out a card (the lead, or after a knockout)
 *   POST { attach, act }                   → { run }: a turn; the Energy goes on card `attach`, then
 *                                            act = { move: i } | { swap: i } | { wait: true }
 * Errors: 404 not_found, 409 over / busy, 422 illegal (not allowed right now), 400 bad_request.
 * Hidden (404) in production until DUEL_PUBLIC.
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { DUEL_PUBLIC } from "@/lib/games-visibility";
import { firePlayer as duelPlayer, ipOf } from "@/lib/fireRound/player";
import { act, getRunView } from "@/lib/originals/duel/store";
import type { DuelStep } from "@/lib/originals/duel/types";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const hidden = () => !DUEL_PUBLIC && process.env.NODE_ENV === "production";
const idx = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 6;

/** The body as a step, or null. */
function stepOf(body: Record<string, unknown>): DuelStep | null {
  if ("next" in body) return idx(body.next) ? { next: body.next } : null;
  const a = body.act as Record<string, unknown> | undefined;
  if (!idx(body.attach) || !a || typeof a !== "object") return null;
  if ("move" in a) return Number.isInteger(a.move) && (a.move as number) >= 0 && (a.move as number) < 8 ? { attach: body.attach, act: { move: a.move as number } } : null;
  if ("swap" in a) return idx(a.swap) ? { attach: body.attach, act: { swap: a.swap } } : null;
  if (a.wait === true) return { attach: body.attach, act: { wait: true } };
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (hidden()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const player = await duelPlayer(req);
  const run = player ? await getRunView(id, player) : null;
  return run ? NextResponse.json({ run }, { headers: noStore }) : NextResponse.json({ error: "not_found" }, { status: 404 });
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
  const st = body && typeof body === "object" ? stepOf(body) : null;
  if (!st) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await act(id, player, st);
  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.error === "over" || r.error === "busy" ? 409 : r.error === "illegal" ? 422 : r.error === "not_ready" ? 503 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json({ run: r.run }, { headers: noStore });
}
