/**
 * Server-side chat broadcasts for market lifecycle events that fire
 * outside a chat-command handler — currently:
 *   - The "closing soon" 60-second warning.
 *   - The auto-lock post-broadcast (when the timer expires without
 *     the host running `!gs market lock` manually).
 *
 * Both flows live in the per-minute `economy-market-lock` cron, so
 * they share this resolver. Returns silently when the market's
 * streamer hasn't connected Twitch yet (defensive — bot can't post
 * without a broadcaster id).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { getLiveUrlForUser } from "@/lib/twitch/streamerSlug";
import type { MarketRow } from "./types";

function botUserId(): string {
  const id = process.env.TWITCH_BOT_USER_ID;
  if (!id) {
    throw new Error(
      "TWITCH_BOT_USER_ID env var is not set. Required for market chat broadcasts.",
    );
  }
  return id;
}

interface BroadcastContext {
  broadcasterId: string;
  ownerUserId: string;
  liveUrl: string | null;
}

async function resolveBroadcastContext(
  market: MarketRow,
): Promise<BroadcastContext | null> {
  const admin = createServiceClient();
  // gs_streams carries the bot routing for the session's stream.
  const { data: streamRow } = await admin
    .from("gs_streams")
    .select("owner_user_id, twitch_user_id")
    .eq("id", market.stream_id)
    .maybeSingle();
  const stream = streamRow as
    | { owner_user_id: string; twitch_user_id: string | null }
    | null;
  if (!stream?.twitch_user_id) return null;
  const liveUrl = await getLiveUrlForUser(stream.owner_user_id).catch(
    () => null,
  );
  return {
    broadcasterId: stream.twitch_user_id,
    ownerUserId: stream.owner_user_id,
    liveUrl,
  };
}

/** Compose the live-page suffix only when a URL is resolvable. Keeps
 *  the bare message clean for streamers who haven't set a slug. */
function liveSuffix(liveUrl: string | null): string {
  if (!liveUrl) return "";
  return ` · or pick on https://${liveUrl}`;
}

/** Fire the "closing in <60s" warning to the streamer's Twitch chat.
 *  Best-effort — failures are logged. The market row should already
 *  have its `notifications.lock_60s` stamp by the time this runs;
 *  the cron flow claims first, broadcasts after. */
export async function broadcastClosingSoon(market: MarketRow): Promise<void> {
  try {
    const ctx = await resolveBroadcastContext(market);
    if (!ctx) return;
    const message =
      `⏰ Market closing in 60s — last call! Bet "!bet <option> <amount>" in chat` +
      liveSuffix(ctx.liveUrl) +
      ".";
    await sendChatMessage({
      broadcasterId: ctx.broadcasterId,
      senderId: botUserId(),
      message,
    });
  } catch (err) {
    console.error("[markets/broadcasts] closing-soon broadcast failed", {
      marketId: market.id,
      err,
    });
  }
}

/** Post the auto-lock notification. Distinct from the manual lock
 *  handler (which posts inline from `handleMarketLockCommand`) — when
 *  the timer fires automatically, viewers also deserve to know the
 *  betting window closed. */
export async function broadcastAutoLocked(market: MarketRow): Promise<void> {
  try {
    const ctx = await resolveBroadcastContext(market);
    if (!ctx) return;
    const message = `🔒 Market locked — no more bets. Waiting on the outcome.`;
    await sendChatMessage({
      broadcasterId: ctx.broadcasterId,
      senderId: botUserId(),
      message,
    });
  } catch (err) {
    console.error("[markets/broadcasts] auto-lock broadcast failed", {
      marketId: market.id,
      err,
    });
  }
}
