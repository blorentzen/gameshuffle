/**
 * POST /api/polls/[id]/vote
 *
 * Public viewer vote from /live. Keyed by the anonymous sessionStorage id
 * (`anonSessionId`) — one vote per browser, changeable while the poll allows it.
 * Chat/Discord votes go through their own adapters (gs_identity), not this route.
 *
 * Returns the fresh tally so the caller can update immediately.
 */

import { NextResponse } from "next/server";
import { castVote, tally } from "@/lib/polls/store";

export const runtime = "nodejs";

/**
 * Best-effort per-IP rate limit. In-memory (per warm instance) — not a hard
 * guarantee across the serverless fleet, but it blunts a single client minting
 * anon ids to stuff the ballot. The per-(poll, anon) unique index is the real
 * one-vote guarantee; this caps request volume.
 */
const RATE = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 15;

function rateLimited(ip: string, now: number): boolean {
  // Opportunistic prune so the map can't grow unbounded.
  if (RATE.size > 5000) {
    for (const [k, v] of RATE) if (now > v.resetAt) RATE.delete(k);
  }
  const e = RATE.get(ip);
  if (!e || now > e.resetAt) {
    RATE.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  e.count += 1;
  return e.count > MAX_PER_WINDOW;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip, Date.now())) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: { optionId?: string; anonSessionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const optionId = String(body.optionId ?? "");
  const anonSessionId = body.anonSessionId ? String(body.anonSessionId) : "";
  if (!optionId || !anonSessionId) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const result = await castVote({ pollId: id, optionId, anonSessionId });
  if (!result.ok) {
    const status = result.reason === "not_open" ? 409 : 400;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, tally: await tally(id) });
}
