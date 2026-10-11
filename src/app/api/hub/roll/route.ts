/**
 * POST /api/hub/roll
 *
 * Body: { sessionId, kind: "pick" | "setup" | "battle", arg? }
 *
 * The stream page's quick rolls for any game: the streamer's own pick
 * (`!gs-shuffle`), a match roll (`!gs setup`) or a viewer battle
 * (`!gs-battle`). Runs the same chat handlers as the broadcaster, so the
 * result posts in chat and shows on the overlay exactly as if typed. Mario
 * Kart's race rolls stay on /api/twitch/race/reroll.
 *
 * Auth: signed in, and the owner of a session that is live (or a Full-access
 * mod acting from their mod page, src/lib/mods/acting.ts).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { streamOwnerFor } from "@/lib/mods/acting";
import { handleShuffleCommand, type ShuffleContext } from "@/lib/twitch/commands/shuffle";
import { handleSetupCommand } from "@/lib/twitch/commands/setup";
import { handleBattleCommand } from "@/lib/twitch/commands/battle";

export const runtime = "nodejs";

type Kind = "pick" | "setup" | "battle";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; kind?: Kind; arg?: string };
  const kind = body.kind;
  if (!body.sessionId || !kind || !["pick", "setup", "battle"].includes(kind)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const arg = typeof body.arg === "string" ? body.arg.slice(0, 40) : "";

  const admin = createServiceClient();
  const { ownerUserId } = await streamOwnerFor(user.id);
  const { data: session } = await admin
    .from("gs_sessions")
    .select("id")
    .eq("id", body.sessionId)
    .eq("owner_user_id", ownerUserId)
    .in("status", ["active", "ending"])
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "session_not_found" }, { status: 404 });

  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id, twitch_login, twitch_display_name, overlay_token")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (!connection?.twitch_user_id) return NextResponse.json({ error: "twitch_not_connected" }, { status: 400 });

  const twitchId = connection.twitch_user_id as string;
  const ctx: ShuffleContext = {
    userId: ownerUserId,
    platform: "twitch",
    broadcasterTwitchId: twitchId,
    senderTwitchId: twitchId,
    senderLogin: (connection.twitch_login as string | null) ?? "",
    senderDisplayName: (connection.twitch_display_name as string | null) ?? (connection.twitch_login as string | null) ?? "Streamer",
    isBroadcaster: true,
    isModerator: true,
    botTwitchId: process.env.TWITCH_BOT_USER_ID || "",
    overlayToken: (connection.overlay_token as string | null) ?? null,
    args: arg,
  };

  try {
    if (kind === "pick") await handleShuffleCommand(ctx);
    else if (kind === "setup") await handleSetupCommand(ctx);
    else await handleBattleCommand(ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[hub/roll] handler failed:", err);
    return NextResponse.json({ error: "roll_failed" }, { status: 500 });
  }
}
