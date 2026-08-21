/**
 * GET / PATCH /api/polls/[id]
 *
 *   GET   → { poll, tally } — owner-scoped (management view).
 *   PATCH → { action: "open" | "close" } lifecycle transition (Pro-gated).
 *
 * Both enforce that the poll belongs to the caller's community.
 */

import { NextResponse } from "next/server";
import { getPoll, openPoll, closePoll, tally, isPollError } from "@/lib/polls/store";
import { ownerContext } from "../route";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await ownerContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const poll = await getPoll(id);
  if (!poll || poll.communityId !== ctx.communityId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, poll, tally: await tally(id) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await ownerContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  const { id } = await params;

  const poll = await getPoll(id);
  if (!poll || poll.communityId !== ctx.communityId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const result =
    body.action === "open"
      ? await openPoll(id)
      : body.action === "close"
        ? await closePoll(id)
        : { error: "bad_action" };
  if (isPollError(result)) {
    const status = result.error === "bad_action" ? 400 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, poll: result });
}
