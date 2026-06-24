/**
 * GET /api/social/connections?userId=<id>&type=followers|following
 * → { users: (FriendProfile & { isFollowing })[] }
 *
 * Public lists; each row carries whether the (optional) signed-in viewer
 * already follows that user, for the in-list Follow button.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/social/topFriends";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  const type = req.nextUrl.searchParams.get("type");
  if (!userId || (type !== "followers" && type !== "following")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const users = await getConnections(userId, type, user?.id);
  return NextResponse.json({ ok: true, users });
}
