/**
 * A report ticket (the reporter, the time's owner and reviewers).
 *   GET                                        → the ticket and its messages
 *   POST { action: "reply", body, link? }      → a message (the owner answering, or a reviewer asking)
 *   POST { action: "decide", outcome, note }   → reviewers: keep or remove the time
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { decideTicket, replyTicket, ticketView } from "@/lib/timeTrials/review";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const view = await ticketView(id, { player: actor.player, userId: actor.userId });
  if (!view) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ticket: view }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-ticket:${actor.player}`, { max: 30, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; body?: unknown; link?: unknown; outcome?: unknown; note?: unknown };
  if (b.action === "reply") {
    const link = typeof b.link === "string" && b.link.trim() ? b.link.trim() : null;
    if (link && !/^https:\/\/[^\s]{4,300}$/.test(link)) return NextResponse.json({ ok: false, error: "bad_link" }, { status: 400 });
    return NextResponse.json(await replyTicket(id, { player: actor.player, userId: actor.userId }, typeof b.body === "string" ? b.body : "", link));
  }
  if (b.action === "decide" && (b.outcome === "kept" || b.outcome === "removed") && actor.userId) {
    return NextResponse.json(await decideTicket(id, actor.userId, b.outcome, typeof b.note === "string" ? b.note : ""));
  }
  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
