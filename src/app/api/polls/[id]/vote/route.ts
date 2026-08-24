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
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Per-IP cap on vote requests. The per-(poll, anon) unique index is the real
// one-vote guarantee; this blunts a single client minting anon ids to stuff the
// ballot. Distributed via Upstash when configured, in-memory otherwise.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const { ok: underLimit } = await rateLimit(`pollvote:${ip}`, { max: 15, windowMs: 10_000 });
  if (!underLimit) {
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
