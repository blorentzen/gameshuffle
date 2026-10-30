/**
 * One time.
 *   DELETE                          → removes your own time
 *   POST { action: "report", reason? } → reports someone's time (signed in; staff review it)
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { removeOwnTime, reportTime } from "@/lib/timeTrials/store";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const ok = await removeOwnTime(actor.player, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-report:${actor.player}`, { max: 20, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; reason?: unknown };
  if (body.action !== "report") return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const ok = await reportTime(id, actor.player, typeof body.reason === "string" ? body.reason.trim() || null : null);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
