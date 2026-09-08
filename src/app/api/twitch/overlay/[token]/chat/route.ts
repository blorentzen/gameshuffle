/**
 * GET /api/twitch/overlay/[token]/chat?since=<iso>
 *
 * Public endpoint for the OBS chat-timeline overlay. Resolves an overlay_token
 * to its connection and returns recent chat messages + display settings. The
 * token IS the authorization (same model as /latest). Returns an empty,
 * disabled payload when the streamer hasn't turned the overlay on.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  getChatOverlaySettings,
  getRecentChatMessages,
  DEFAULT_CHAT_OVERLAY_SETTINGS,
} from "@/lib/overlay/chat";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("user_id, chat_overlay_enabled")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) return NextResponse.json({ error: "unknown_token" }, { status: 404 });

  const conn = connection as { user_id: string; chat_overlay_enabled: boolean | null };
  if (!conn.chat_overlay_enabled) {
    return NextResponse.json({ ok: true, enabled: false, settings: DEFAULT_CHAT_OVERLAY_SETTINGS, messages: [] });
  }

  const since = new URL(request.url).searchParams.get("since");
  const settings = await getChatOverlaySettings(conn.user_id);
  const messages = await getRecentChatMessages(conn.user_id, settings, since);

  return NextResponse.json({ ok: true, enabled: true, settings, messages });
}
