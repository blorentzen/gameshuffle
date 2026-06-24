/**
 * GET /api/account/top-friends → { topFriends, following } for the editor
 * PUT /api/account/top-friends { friendIds } → save ordered top friends
 *
 * Only ids the caller actually follows are kept (server-validated), capped.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getTopFriends,
  getFollowingProfiles,
  setTopFriends,
} from "@/lib/social/topFriends";

export const runtime = "nodejs";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [topFriends, following] = await Promise.all([
    getTopFriends(userId),
    getFollowingProfiles(userId),
  ]);
  return NextResponse.json({ ok: true, topFriends, following });
}

export async function PUT(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { friendIds?: unknown } | null;
  const friendIds = Array.isArray(body?.friendIds)
    ? body.friendIds.filter((x): x is string => typeof x === "string")
    : null;
  if (!friendIds) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await setTopFriends(userId, friendIds);
  return NextResponse.json({ ok: true });
}
