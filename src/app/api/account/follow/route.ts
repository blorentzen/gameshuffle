/**
 * GET    /api/account/follow?userId=<id> → { followers, following, isFollowing, isMutual }
 * POST   /api/account/follow { userId }   → follow
 * DELETE /api/account/follow?userId=<id>  → unfollow
 *
 * Caller is the follower. follow() refuses if a block exists either way.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  follow,
  unfollow,
  getFollowCounts,
  getFollowState,
} from "@/lib/social/follows";

export const runtime = "nodejs";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("userId") ?? "";
  if (!target) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const viewerId = await authUserId();
  const [counts, state] = await Promise.all([
    getFollowCounts(target),
    viewerId
      ? getFollowState(viewerId, target)
      : Promise.resolve({ isFollowing: false, isMutual: false }),
  ]);
  return NextResponse.json({ ok: true, ...counts, ...state });
}

export async function POST(req: NextRequest) {
  const viewerId = await authUserId();
  if (!viewerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const target = typeof body?.userId === "string" ? body.userId : "";
  if (!target) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await follow(viewerId, target);
  if (!res.ok) return NextResponse.json({ error: res.reason ?? "failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const viewerId = await authUserId();
  if (!viewerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const target = req.nextUrl.searchParams.get("userId") ?? "";
  if (!target) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await unfollow(viewerId, target);
  return NextResponse.json({ ok: true });
}
