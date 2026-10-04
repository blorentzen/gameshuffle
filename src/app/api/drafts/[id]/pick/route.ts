/**
 * POST /api/drafts/[id]/pick — a captain picks a player from /live.
 * Body: { key }. Only the captain on the clock (recognized by their GameShuffle
 * account or linked Twitch) or the streamer can pick.
 */

import { NextResponse } from "next/server";
import { isCaptainOnClock } from "@/lib/drafts/captains";
import { DraftsNotReady, getDraft, pickPlayer, teamOnClock, viewOf } from "@/lib/drafts/store";
import { draftViewer, ownsCommunity } from "@/lib/drafts/viewer";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await draftViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { key?: string } | null;
  if (!body?.key) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    const draft = await getDraft(id);
    if (!draft || draft.mode !== "captains" || draft.status !== "open") return NextResponse.json({ ok: false, error: "not_open" }, { status: 409 });
    const captain = isCaptainOnClock(teamOnClock(draft), viewer);
    if (!captain && !(await ownsCommunity(viewer.userId, draft.communityId))) return NextResponse.json({ ok: false, error: "not_your_turn" }, { status: 403 });
    const r = await pickPlayer(draft, body.key, captain ? "captain" : "streamer");
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true, draft: await viewOf(r.value) });
  } catch (err) {
    if (err instanceof DraftsNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    throw err;
  }
}
