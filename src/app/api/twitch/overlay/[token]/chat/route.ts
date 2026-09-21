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

  // Resolve the overlay token against Twitch first, then YouTube. Twitch has an
  // explicit `chat_overlay_enabled` toggle; YouTube has no such column/UI yet,
  // so the chat overlay defaults ON there (it only renders if the streamer adds
  // the browser source, and the poller only persists chat while live).
  const admin = createTwitchAdminClient();
  let ownerUserId: string;
  let enabled: boolean;
  const { data: twConn } = await admin
    .from("twitch_connections")
    .select("user_id, chat_overlay_enabled")
    .eq("overlay_token", token)
    .maybeSingle();
  if (twConn) {
    ownerUserId = (twConn as { user_id: string }).user_id;
    enabled = !!(twConn as { chat_overlay_enabled?: boolean | null }).chat_overlay_enabled;
  } else {
    const { data: ytConn } = await admin
      .from("youtube_connections")
      .select("user_id")
      .eq("overlay_token", token)
      .maybeSingle();
    if (!ytConn) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
    ownerUserId = (ytConn as { user_id: string }).user_id;
    enabled = true;
  }

  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, settings: DEFAULT_CHAT_OVERLAY_SETTINGS, messages: [] });
  }

  const since = new URL(request.url).searchParams.get("since");
  const settings = await getChatOverlaySettings(ownerUserId);
  const messages = await getRecentChatMessages(ownerUserId, settings, since);

  return NextResponse.json({ ok: true, enabled: true, settings, messages });
}
