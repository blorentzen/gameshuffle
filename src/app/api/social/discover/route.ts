/** GET /api/social/discover — find players (authed). Query: q, game, region, online, streamers. */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverPlayers } from "@/lib/social/discovery";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const players = await discoverPlayers({
    viewerId: user.id,
    query: sp.get("q"),
    game: sp.get("game"),
    region: sp.get("region"),
    onlineOnly: sp.get("online") === "1",
    streamersOnly: sp.get("streamers") === "1",
  });
  return NextResponse.json({ ok: true, players });
}
