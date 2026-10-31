/**
 * One time.
 *   DELETE                                      → removes your own time
 *   POST { action: "report", reason, link? }    → opens a ticket on someone's time (signed in)
 *   POST { action: "video", url }               → your clip of the run's last 30 seconds, for a reviewer to check
 */
import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { nudgeMovedUp, removeOwnTime, setVideo, timeById, topTensAround } from "@/lib/timeTrials/store";
import { openTicket } from "@/lib/timeTrials/review";
import { videoProof } from "@/lib/timeTrials/rules";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const t = await timeById(id);
  const before = t && t.player === actor.player && t.status === "ok" ? await topTensAround(t) : null;
  const ok = await removeOwnTime(actor.player, id);
  if (ok && t && before) after(() => nudgeMovedUp(t, before));
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; reason?: unknown; link?: unknown; url?: unknown };
  if (body.action === "video") {
    if (!(await rateLimit(`tt-video:${actor.player}`, { max: 30, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
    const url = typeof body.url === "string" ? videoProof(body.url) : null;
    if (!url) return NextResponse.json({ ok: false, error: "bad_video" }, { status: 400 });
    const ok = await setVideo(actor.player, id, url);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (body.action !== "report") return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (!(await rateLimit(`tt-report:${actor.player}`, { max: 20, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ ok: false, error: "reason_needed" }, { status: 400 });
  const link = typeof body.link === "string" && body.link.trim() ? body.link.trim() : null;
  if (link && !/^https:\/\/[^\s]{4,300}$/.test(link)) return NextResponse.json({ ok: false, error: "bad_link" }, { status: 400 });
  const res = await openTicket({ timeId: id, reporter: actor.player, reason, link });
  return NextResponse.json(res, { status: res.ok ? 200 : res.error === "gone" ? 404 : 400 });
}
