/**
 * One time.
 *   GET                                         → everything for its window on the board (round 3 pick 1A); for a reviewer of its
 *                                                 game and items, `reviewer` = whether it can be verified and the clip waiting
 *   POST { action: "proof", proofUrl, readToken? }   → a screenshot for your own time that has none (picks 2026-11-04, 21A)
 *   POST { action: "vouch" | "unvouch" }        → vouch for it (anyone signed in, never their own time; picks 2026-11-04)
 *   DELETE                                      → removes your own time
 *   POST { action: "report", reason, link? }    → opens a ticket on someone's time (signed in)
 *   POST { action: "video", url }               → your clip of the run's last 30 seconds, for a reviewer to check
 *   POST { action: "fix", time, cc, items, vehicle, laps? } → correct your own time until it's verified (picks 2026-11-08)
 * A clip, a picture or a fix on a time with an open ask answers it: the time goes back to reviewers marked Updated.
 */
import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { attachShot, fixTime, nudgeMovedUp, removeOwnTime, setVideo, timeById, topTensAround } from "@/lib/timeTrials/store";
import { noteOwnerUpdate } from "@/lib/timeTrials/asks";
import { isItems, isVehicle } from "@/lib/timeTrials/categories";
import { isClassFor } from "@/lib/timeTrials/tracks";
import { readFrom } from "@/lib/timeTrials/proof";
import { keyFromPublicUrl } from "@/lib/storage/r2";
import { openTicket } from "@/lib/timeTrials/review";
import { setVouch, timeDetail } from "@/lib/timeTrials/detail";
import { cleanLaps, parseTime, videoProof } from "@/lib/timeTrials/rules";
import { inScope, reviewScope } from "@/lib/timeTrials/updaters";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await siteActor();
  // Reviewers and the updater for its game and items can verify it from the window (picks 2026-11-04), and see its ask.
  const scope = actor?.userId ? await reviewScope(actor.userId) : null;
  const t = scope ? await timeById(id) : null;
  const reviews = !!(scope && t && inScope(scope, t));
  const detail = await timeDetail(id, actor?.player ?? null, reviews);
  if (!detail) return NextResponse.json({ ok: false, error: "gone" }, { status: 404 });
  const reviewer: { canVerify: boolean; clip: string | null } | null = reviews && t ? { canVerify: t.video !== "checked", clip: t.video === "waiting" ? t.videoUrl : null } : null;
  return NextResponse.json({ ok: true, time: detail, reviewer }, { headers: { "Cache-Control": "private, no-store" } });
}

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
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; reason?: unknown; link?: unknown; url?: unknown; proofUrl?: unknown; readToken?: unknown; time?: unknown; cc?: unknown; items?: unknown; vehicle?: unknown; laps?: unknown };
  if (body.action === "video") {
    if (!(await rateLimit(`tt-video:${actor.player}`, { max: 30, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
    const url = typeof body.url === "string" ? videoProof(body.url) : null;
    if (!url) return NextResponse.json({ ok: false, error: "bad_video" }, { status: 400 });
    const ok = await setVideo(actor.player, id, url);
    if (ok) await noteOwnerUpdate(id, actor.player, actor.userId, "Sent a new clip.", url);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (body.action === "fix") {
    if (!(await rateLimit(`tt-fix:${actor.player}`, { max: 20, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
    const timeMs = typeof body.time === "string" ? parseTime(body.time) : null;
    const cc = Number(body.cc);
    if (timeMs == null) return NextResponse.json({ ok: false, error: "bad_time" }, { status: 400 });
    const before = await timeById(id);
    if (!before) return NextResponse.json({ ok: false, error: "gone" }, { status: 404 });
    if (!isClassFor(before.game, cc) || !isItems(body.items) || !isVehicle(body.vehicle)) return NextResponse.json({ ok: false, error: "bad_class" }, { status: 400 });
    const laps = body.laps == null || (Array.isArray(body.laps) && body.laps.length === 0) ? null : cleanLaps(body.laps);
    if (body.laps != null && Array.isArray(body.laps) && body.laps.length && !laps) return NextResponse.json({ ok: false, error: "bad_laps" }, { status: 400 });
    const res = await fixTime(actor.player, id, { timeMs, cc: cc as typeof before.cc, items: body.items, vehicle: body.vehicle, laps });
    if (!res.ok) return NextResponse.json(res, { status: res.error === "gone" ? 404 : res.error === "not_yours" ? 403 : res.error === "not_ready" ? 503 : 400 });
    await noteOwnerUpdate(id, actor.player, actor.userId, `Changed ${res.changed}.`);
    return NextResponse.json(res);
  }
  if (body.action === "proof") {
    // A screenshot for your own time that has none (an imported one), uploaded through /api/time-trials/read first.
    if (!actor.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
    if (!(await rateLimit(`tt-proof:${actor.player}`, { max: 30, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
    const proofUrl = typeof body.proofUrl === "string" ? body.proofUrl : "";
    const key = keyFromPublicUrl(proofUrl);
    if (!key || !key.startsWith(`time-trials/${actor.userId}/`)) return NextResponse.json({ ok: false, error: "bad_proof" }, { status: 400 });
    const read = readFrom(body.readToken, proofUrl);
    const res = await attachShot({ player: actor.player, timeId: id, proofUrl, readMs: read?.timeMs ?? null });
    if (res.ok) await noteOwnerUpdate(id, actor.player, actor.userId, "Added a picture.", proofUrl);
    return NextResponse.json(res, { status: res.ok ? 200 : res.error === "gone" ? 404 : res.error === "has_proof" ? 409 : 500 });
  }
  if (body.action === "vouch" || body.action === "unvouch") {
    if (!(await rateLimit(`tt-vouch:${actor.player}`, { max: 60, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
    const res = await setVouch(id, actor.player, body.action === "vouch");
    return NextResponse.json({ ok: res === "ok", error: res === "ok" ? undefined : res }, { status: res === "ok" ? 200 : res === "gone" ? 404 : 400 });
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
