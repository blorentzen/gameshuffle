/** Mention autocomplete candidates for the composer — the viewer's follows. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { getFollowingProfiles } from "@/lib/social/topFriends";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  const following = await getFollowingProfiles(user.id);
  const users = following
    .filter((f) => f.username)
    .map((f) => {
      const name = f.displayName || f.username || "Player";
      return {
        id: f.id,
        name,
        username: f.username as string,
        avatar: f.discordAvatar || f.twitchAvatar || undefined,
        initials: name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?",
      };
    });
  return NextResponse.json({ ok: true, users });
}
