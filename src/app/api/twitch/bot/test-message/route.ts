/**
 * POST /api/twitch/bot/test-message
 *
 * Sends a one-off test chat message from the GameShuffle bot into the
 * authenticated streamer's channel. Used from the dashboard to confirm the
 * bot is authorized end-to-end before going live.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { sendChatMessage } from "@/lib/twitch/client";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId) {
    return NextResponse.json({ error: "bot_not_configured" }, { status: 500 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.twitch_user_id) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    await sendChatMessage({
      broadcasterId: connection.twitch_user_id,
      senderId: botId,
      message: "🎲 GameShuffle test mode is active. Bot is connected and ready.",
    });
  } catch (err) {
    console.error("[twitch-bot-test-message] send failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "send_failed", message }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
