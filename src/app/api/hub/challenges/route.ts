/**
 * GET  /api/hub/challenges?session=<id>  → the stream's open chaos challenges
 *      (and market-settled ones still waiting for a winner), plus who could
 *      have done them (the lobby, then recently active chatters)
 * POST /api/hub/challenges { session, challengeId, done, winners? } → settle
 *      one: Done (with who did it, for an open challenge) or Not done
 *
 * The streamer, or a Full-access mod from their mod page (streamOwnerFor).
 * Rules in src/lib/economy/events/challenges.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { streamOwnerFor } from "@/lib/mods/acting";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { hubChallenges, settleChallenge, winnerCandidates } from "@/lib/economy/events/challenges";

export const runtime = "nodejs";

async function ownedSession(sessionId: string | null): Promise<{ ownerUserId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!sessionId) return NextResponse.json({ error: "missing_session" }, { status: 400 });
  const { data: session } = await createServiceClient().from("gs_sessions").select("owner_user_id").eq("id", sessionId).maybeSingle();
  const { ownerUserId } = await streamOwnerFor(user.id);
  if (!session || (session as { owner_user_id: string }).owner_user_id !== ownerUserId) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  return { ownerUserId };
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session");
  const owned = await ownedSession(sessionId);
  if (owned instanceof NextResponse) return owned;
  const communityId = await resolveCommunityIdForOwner(owned.ownerUserId).catch(() => null);
  const [challenges, candidates] = await Promise.all([hubChallenges(sessionId!), winnerCandidates(sessionId!, communityId)]);
  return NextResponse.json({ ok: true, challenges, candidates }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { session?: string; challengeId?: string; done?: boolean; winners?: unknown };
  const owned = await ownedSession(body.session ?? null);
  if (owned instanceof NextResponse) return owned;
  if (!body.challengeId || typeof body.done !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const winners = Array.isArray(body.winners) ? body.winners.filter((w): w is string => typeof w === "string" && /^[0-9a-f-]{36}$/i.test(w)) : [];
  const res = await settleChallenge({ sessionId: body.session!, challengeId: body.challengeId, done: body.done, winners });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "not_found" ? 404 : 409 });
  return NextResponse.json(res);
}
