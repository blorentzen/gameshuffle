/**
 * GET /api/drafts/community/[communityId] — the community's current chat draft
 * for /live (public). Also resolves the current pick when its timer is up.
 * During a captain draft, `you.onClock` says whether the signed-in viewer is
 * the captain picking right now (their phone shows the picker).
 */

import { NextResponse } from "next/server";
import { isCaptainOnClock } from "@/lib/drafts/captains";
import { DraftsNotReady, getCurrentDraft, teamOnClock, tickDraft, viewOf } from "@/lib/drafts/store";
import { draftViewer, ownsCommunity } from "@/lib/drafts/viewer";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  try {
    let draft = await getCurrentDraft(communityId);
    if (draft) draft = await tickDraft(draft);
    let you: { onClock: boolean; streamer: boolean } | null = null;
    if (draft?.mode === "captains" && draft.status === "open") {
      const viewer = await draftViewer().catch(() => null);
      if (viewer) you = { onClock: isCaptainOnClock(teamOnClock(draft), viewer), streamer: await ownsCommunity(viewer.userId, communityId) };
    }
    return NextResponse.json({ ok: true, draft: draft ? await viewOf(draft) : null, you });
  } catch (err) {
    if (err instanceof DraftsNotReady) return NextResponse.json({ ok: true, draft: null });
    console.error("[drafts/community] read failed:", err);
    return NextResponse.json({ ok: true, draft: null });
  }
}
