/**
 * POST /api/twitch/overlay/[token]/announce-spin { spinId }
 *
 * Called by the OBS overlay when a wheel spin FINISHES animating on stream.
 * Posts the winner to chat — exactly once, via an atomic `announced_at`
 * claim — so chat never spoils the result before the wheel lands. Only the
 * token-owner's latest spin can be announced.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getLatestSpin } from "@/lib/wheels/store";
import { sendChatMessage } from "@/lib/twitch/client";
import { YouTubeAdapter } from "@/lib/adapters/youtube";
import { wheelSpinResultMessage } from "@/lib/twitch/commands/messages";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { spinId?: unknown } | null;
  const spinId = typeof body?.spinId === "string" ? body.spinId : "";
  if (!spinId) return NextResponse.json({ error: "missing_spin" }, { status: 400 });

  // Resolve the overlay token against Twitch first, then YouTube.
  const admin = createTwitchAdminClient();
  let ownerUserId: string;
  let platform: "twitch" | "youtube" = "twitch";
  let twitchUserId: string | null = null;
  const { data: twConn } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_user_id")
    .eq("overlay_token", token)
    .maybeSingle();
  if (twConn) {
    ownerUserId = twConn.user_id;
    twitchUserId = twConn.twitch_user_id as string;
  } else {
    const { data: ytConn } = await admin
      .from("youtube_connections")
      .select("user_id")
      .eq("overlay_token", token)
      .maybeSingle();
    if (!ytConn) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
    ownerUserId = ytConn.user_id;
    platform = "youtube";
  }

  // Guard: only the owner's most recent spin is announceable.
  const latest = await getLatestSpin(ownerUserId);
  if (!latest || latest.id !== spinId) {
    return NextResponse.json({ ok: true, skipped: "stale" });
  }

  const botId = process.env.TWITCH_BOT_USER_ID;
  if (platform === "twitch" && !botId) return NextResponse.json({ ok: true, skipped: "no_bot" });

  // Atomic claim — whoever flips announced_at from NULL wins the announce.
  const { data: claimed } = await admin
    .from("gs_wheel_spins")
    .update({ announced_at: new Date().toISOString() })
    .eq("id", spinId)
    .is("announced_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, skipped: "already" });
  }

  const message = wheelSpinResultMessage(latest.winningLabel);
  if (platform === "youtube") {
    // Post as the streamer's own channel (no bot on YouTube).
    await new YouTubeAdapter({ sessionId: "wheel-announce", ownerUserId }).postChatMessage(message);
  } else {
    await sendChatMessage({
      broadcasterId: twitchUserId as string,
      senderId: botId as string,
      message,
    });
  }
  return NextResponse.json({ ok: true, announced: true });
}
