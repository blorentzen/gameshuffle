/**
 * GET /api/activity/dev-session?as=linked|guest  (development only; 404 elsewhere)
 *
 * A signed-in Activity session without Discord, so the Activity's layout can
 * be previewed and screenshotted at Discord's sizes on localhost
 * (/discord/activity?preview=linked or ?preview=guest).
 *   linked  a dev account that has Discord connected (Weekly playable)
 *   guest   a Discord identity with no GameShuffle account
 * `&name=` sets the display name shown in the band (for screenshots); a guest
 * with a name is its own Discord identity, so several names are several players.
 * `&room=` puts the session in a play-together room (`dev-<room>`), so a few
 * browser windows with different names can test a room without Discord.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { signSession } from "@/lib/activity/session";
import { resolveIdentity } from "@/lib/economy/identity";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const params = new URL(req.url).searchParams;
  const linked = params.get("as") !== "guest";
  const nameOverride = params.get("name")?.slice(0, 32) || null;
  let did = "activity-preview";
  let name = "Preview Player";
  let uid: string | null = null;
  if (linked) {
    const { data } = await createServiceClient().from("users").select("id, discord_id, display_name, username").not("discord_id", "is", null).limit(1).maybeSingle();
    const u = data as { id: string; discord_id: string; display_name: string | null; username: string | null } | null;
    if (u) { did = u.discord_id; name = u.display_name || u.username || name; uid = u.id; }
  }
  if (nameOverride) name = nameOverride;
  if (!linked && nameOverride) did = `activity-preview-${nameOverride.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
  const room = params.get("room")?.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || null;
  const { identityId } = await resolveIdentity({ platform: "discord", platformId: did, displayName: name });
  return NextResponse.json({
    ok: true,
    session: signSession({ did, iid: identityId, uid, name, avatar: null, ins: room ? `dev-${room}` : null }),
    user: { id: did, name, avatar: null, linked: !!uid },
  });
}
