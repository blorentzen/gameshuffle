/**
 * One Fire Round (src/lib/fireRound/store.ts), for the player who started it.
 *   GET                                         → the round (ended first if its clock ran out)
 *   POST { action: "typed", text }              → a typed answer (a close one opens the four choices)
 *        { action: "choice", text }             → one of the four choices
 *        { action: "choices" }                  → open the four choices (40 points instead of 100)
 *        { action: "skip" } | { action: "stop" }
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { act, runView, type FireAction } from "@/lib/fireRound/store";
import { firePlayer, ipOf } from "@/lib/fireRound/player";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await firePlayer(req);
  const run = player ? await runView(id, player) : null;
  return run ? NextResponse.json({ run }, { headers: noStore }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await firePlayer(req);
  if (!player) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // A fast player answers every few seconds; this only stops scripts.
  const { ok: under } = await rateLimit(`fire-act:${ipOf(req)}`, { max: 240, windowMs: 5 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; text?: unknown };
  const text = typeof body.text === "string" ? body.text : "";
  let action: FireAction | null = null;
  if (body.action === "typed") action = { kind: "typed", text };
  else if (body.action === "choice") action = { kind: "choice", text };
  else if (body.action === "choices") action = { kind: "choices" };
  else if (body.action === "skip") action = { kind: "skip" };
  else if (body.action === "stop") action = { kind: "stop" };
  if (!action) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await act(id, player, action);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : r.error === "busy" ? 409 : r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json({ run: r.run, outcome: r.outcome }, { headers: noStore });
}
