/**
 * GET / POST /api/drafts — the streamer's chat drafts (GS Pro).
 *   GET  → { isPro, hasCommunity, pools, draft } (the current draft, if any)
 *   POST → start one. Chat vote: { poolId, rules?, optionsPerPick?, pickSeconds? }.
 *          Captains: { mode: "captains" } opens sign-ups, seeded with the session lobby.
 */

import { NextResponse } from "next/server";
import { bingoOwner as streamOwner } from "@/lib/bingo/owner";
import { DRAFT_POOLS } from "@/lib/drafts/catalog";
import { DraftsNotReady, getCurrentDraft, openSignups, startDraft, tickDraft, viewOf } from "@/lib/drafts/store";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  try {
    let draft = ctx.communityId ? await getCurrentDraft(ctx.communityId) : null;
    if (draft) draft = await tickDraft(draft);
    return NextResponse.json({ ok: true, ready: true, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, pools: DRAFT_POOLS, draft: draft ? await viewOf(draft) : null });
  } catch (err) {
    if (err instanceof DraftsNotReady) return NextResponse.json({ ok: true, ready: false, isPro: ctx.isPro, hasCommunity: !!ctx.communityId, pools: DRAFT_POOLS, draft: null });
    throw err;
  }
}

export async function POST(request: Request) {
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!ctx.communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { mode?: string; poolId?: string; rules?: Record<string, boolean>; optionsPerPick?: number; pickSeconds?: number } | null;
  if (body?.mode !== "captains" && !body?.poolId) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    if (body.mode === "captains") {
      const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]).catch(() => null);
      const r = await openSignups({ communityId: ctx.communityId, createdBy: ctx.userId, sessionId: session?.id ?? null });
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, draft: await viewOf(r.value) });
    }
    const r = await startDraft({ communityId: ctx.communityId, poolId: body.poolId!, rules: body.rules, optionsPerPick: body.optionsPerPick, pickSeconds: body.pickSeconds, createdBy: ctx.userId });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, draft: await viewOf(r.value) });
  } catch (err) {
    if (err instanceof DraftsNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    throw err;
  }
}
