/**
 * GET /api/polls/community/[communityId]
 *
 * Public read of a community's currently-open poll + tally, for the /live
 * voting card. Returns `{ poll: null }` when nothing is open.
 */

import { NextResponse } from "next/server";
import { getOpenPollForCommunity, tally } from "@/lib/polls/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const { communityId } = await params;
  const poll = await getOpenPollForCommunity(communityId);
  if (!poll) return NextResponse.json({ ok: true, poll: null });
  return NextResponse.json({ ok: true, poll, tally: await tally(poll.id) });
}
