/**
 * POST /api/twitch/race/reroll
 *
 * Body: { sessionId: string, kind: 'track' | 'items' | 'race' }
 *
 * Streamer-only manual override for the race randomizer module — same
 * logic as the chat commands `!gs-track` / `!gs-items` / `!gs-race`,
 * surfaced via UI buttons on the configure page per spec §6.2.
 *
 * Auth: active Supabase session, must own the target session id.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  handleItemsCommand,
  handleRaceCommand,
  handleTrackCommand,
  type RaceCommandContext,
} from "@/lib/twitch/commands/race";

export const runtime = "nodejs";

interface RequestBody {
  sessionId?: string;
  kind?: "track" | "items" | "race";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const { sessionId, kind } = body;
  if (!sessionId || !kind || !["track", "items", "race"].includes(kind)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Ownership guard — same shape used by the rest of the Hub server
  // actions. The reroll handler trusts the broadcaster context, so the
  // ownership check is the only thing standing between a token-leak
  // vector and a third party rolling on someone else's session.
  const admin = createServiceClient();
  const { data: session } = await admin
    .from("gs_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("owner_user_id", user.id)
    .in("status", ["active", "ending"])
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  // Look up the broadcaster's Twitch identity so the chat handlers can
  // post in their channel + record the actor on the resulting event.
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id, twitch_display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection?.twitch_user_id) {
    return NextResponse.json({ error: "twitch_not_connected" }, { status: 400 });
  }

  const ctx: RaceCommandContext = {
    userId: user.id,
    broadcasterTwitchId: connection.twitch_user_id as string,
    senderTwitchId: connection.twitch_user_id as string,
    senderDisplayName:
      (connection.twitch_display_name as string | null) ?? "Streamer",
    botTwitchId: process.env.TWITCH_BOT_USER_ID || "",
  };

  try {
    if (kind === "track") await handleTrackCommand(ctx);
    else if (kind === "items") await handleItemsCommand(ctx);
    else await handleRaceCommand(ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[twitch/race/reroll] handler failed:", err);
    return NextResponse.json({ error: "reroll_failed" }, { status: 500 });
  }
}
