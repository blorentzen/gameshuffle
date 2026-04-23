/**
 * POST /api/twitch/webhook
 *
 * Twitch EventSub webhook receiver. Phase 1 handles:
 *   - webhook_callback_verification (HMAC challenge response)
 *   - notification: stream.online   → open a twitch_sessions row
 *   - notification: stream.offline  → mark active session as ended
 *   - notification: channel.update  → update active session category if relevant
 *   - revocation                    → record subscription status change
 *
 * EventSub delivery is at-least-once, so every message_id is recorded in
 * twitch_webhook_events_processed for dedupe. Signature verification uses
 * TWITCH_EVENTSUB_SECRET (HMAC-SHA256 over message_id + timestamp + body).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getChannelInfo } from "@/lib/twitch/client";
import { recordSubscriptionStatus } from "@/lib/twitch/eventsub";
import { resolveRandomizerSlug } from "@/lib/twitch/categories";
import { parseCommand } from "@/lib/twitch/commands/parse";
import { dispatchCommand } from "@/lib/twitch/commands/dispatch";

export const runtime = "nodejs";

const SIGNATURE_PREFIX = "sha256=";

const HEADER_MESSAGE_ID = "twitch-eventsub-message-id";
const HEADER_TIMESTAMP = "twitch-eventsub-message-timestamp";
const HEADER_SIGNATURE = "twitch-eventsub-message-signature";
const HEADER_TYPE = "twitch-eventsub-message-type";

interface SubscriptionMeta {
  id: string;
  type: string;
  version: string;
  status: string;
}

interface NotificationPayload {
  subscription: SubscriptionMeta;
  event: Record<string, unknown>;
}

interface VerificationPayload {
  subscription: SubscriptionMeta;
  challenge: string;
}

interface RevocationPayload {
  subscription: SubscriptionMeta;
}

function getSecret(): string {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) throw new Error("TWITCH_EVENTSUB_SECRET env var is not set");
  return secret;
}

function verifySignature(
  messageId: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;
  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = createHmac("sha256", getSecret())
    .update(messageId + timestamp + rawBody)
    .digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageId = request.headers.get(HEADER_MESSAGE_ID);
  const timestamp = request.headers.get(HEADER_TIMESTAMP);
  const signature = request.headers.get(HEADER_SIGNATURE);
  const messageType = request.headers.get(HEADER_TYPE);

  if (!messageId || !timestamp || !signature || !messageType) {
    return new Response("missing required headers", { status: 400 });
  }

  if (!verifySignature(messageId, timestamp, rawBody, signature)) {
    return new Response("invalid signature", { status: 403 });
  }

  // Reject messages older than 10 minutes (Twitch recommendation)
  const ts = Date.parse(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
    return new Response("stale message", { status: 400 });
  }

  // Verification handshake — respond with the challenge as plain text
  if (messageType === "webhook_callback_verification") {
    const payload = JSON.parse(rawBody) as VerificationPayload;
    return new Response(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const admin = createTwitchAdminClient();

  // Dedupe: if we've already processed this message_id, return 200 immediately
  const { data: existing } = await admin
    .from("twitch_webhook_events_processed")
    .select("message_id")
    .eq("message_id", messageId)
    .maybeSingle();

  if (existing) {
    return new Response("ok", { status: 200 });
  }

  // Record the message_id first so a retry mid-processing doesn't double-handle.
  // PK conflict means another concurrent invocation beat us — bail with 200.
  const { error: insertErr } = await admin
    .from("twitch_webhook_events_processed")
    .insert({ message_id: messageId });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return new Response("ok", { status: 200 });
    }
    console.error("[twitch-webhook] dedupe insert failed:", insertErr);
    return new Response("dedupe error", { status: 500 });
  }

  try {
    if (messageType === "revocation") {
      const payload = JSON.parse(rawBody) as RevocationPayload;
      await recordSubscriptionStatus(payload.subscription.id, payload.subscription.status);
      return new Response("ok", { status: 200 });
    }

    if (messageType === "notification") {
      const payload = JSON.parse(rawBody) as NotificationPayload;
      await handleNotification(payload);
      return new Response("ok", { status: 200 });
    }

    // Unknown message type — log and 200 so Twitch doesn't retry forever
    console.warn(`[twitch-webhook] unknown message type: ${messageType}`);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[twitch-webhook] handler error:", err);
    // Return 200 anyway — Twitch will keep retrying for non-2xx, but we've
    // already recorded the message_id. Surface failures via logs/Sentry instead.
    return new Response("ok", { status: 200 });
  }
}

async function handleNotification(payload: NotificationPayload) {
  const { subscription, event } = payload;

  switch (subscription.type) {
    case "stream.online":
      await handleStreamOnline(event);
      return;
    case "stream.offline":
      await handleStreamOffline(event);
      return;
    case "channel.update":
      await handleChannelUpdate(event);
      return;
    case "channel.chat.message":
      await handleChatMessage(event as ChatMessageEvent);
      return;
    default:
      console.warn(`[twitch-webhook] unhandled subscription type: ${subscription.type}`);
  }
}

interface ChatMessageEvent {
  broadcaster_user_id?: string;
  chatter_user_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  message?: { text?: string };
  badges?: { set_id?: string }[];
}

async function handleChatMessage(event: ChatMessageEvent) {
  const broadcasterId = event.broadcaster_user_id;
  const senderId = event.chatter_user_id;
  const text = event.message?.text;
  if (!broadcasterId || !senderId || !text) return;

  // Ignore the bot's own messages so a `!gs-` echo doesn't loop.
  if (senderId === process.env.TWITCH_BOT_USER_ID) return;

  const command = parseCommand(text);
  if (!command) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) {
    console.warn(`[twitch-webhook] chat from unknown broadcaster ${broadcasterId}`);
    return;
  }

  const badges = event.badges ?? [];
  const isBroadcaster = senderId === broadcasterId || badges.some((b) => b.set_id === "broadcaster");
  const isModerator = isBroadcaster || badges.some((b) => b.set_id === "moderator");

  await dispatchCommand(command, {
    userId: connection.user_id,
    broadcasterTwitchId: broadcasterId,
    senderTwitchId: senderId,
    senderLogin: (event.chatter_user_login || "").toLowerCase(),
    senderDisplayName: event.chatter_user_name || event.chatter_user_login || "viewer",
    isBroadcaster,
    isModerator,
    botTwitchId: process.env.TWITCH_BOT_USER_ID || "",
  });
}

interface StreamOnlineEvent {
  broadcaster_user_id?: string;
}

interface StreamOfflineEvent {
  broadcaster_user_id?: string;
}

interface ChannelUpdateEvent {
  broadcaster_user_id?: string;
  category_id?: string;
  category_name?: string;
  title?: string;
}

interface ConnectionRow {
  user_id: string;
  twitch_user_id: string;
}

async function getConnectionByTwitchUserId(twitchUserId: string): Promise<ConnectionRow | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_user_id")
    .eq("twitch_user_id", twitchUserId)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

async function handleStreamOnline(event: StreamOnlineEvent) {
  const broadcasterId = event.broadcaster_user_id;
  if (!broadcasterId) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) {
    console.warn(`[twitch-webhook] stream.online for unknown broadcaster ${broadcasterId}`);
    return;
  }

  // stream.online doesn't include category — fetch current channel info
  const channelInfo = await getChannelInfo(broadcasterId);
  const categoryId = channelInfo?.game_id;
  if (!categoryId) {
    console.warn(`[twitch-webhook] stream.online with no category for ${broadcasterId}`);
    return;
  }

  const slug = await resolveRandomizerSlug(categoryId, channelInfo?.game_name ?? null);
  if (!slug) {
    // Streamer is live but not in a supported category — don't open a session.
    return;
  }

  const admin = createTwitchAdminClient();

  // Close any stale sessions first — both 'active' (defense against missed
  // offline events) AND 'test' (so a leftover test session can't outrank
  // or co-exist with the new live session and serve the wrong randomizer
  // for !gs-shuffle).
  await admin
    .from("twitch_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("user_id", connection.user_id)
    .in("status", ["active", "test"]);

  await admin.from("twitch_sessions").insert({
    user_id: connection.user_id,
    randomizer_slug: slug,
    twitch_category_id: categoryId,
    status: "active",
  });
}

async function handleStreamOffline(event: StreamOfflineEvent) {
  const broadcasterId = event.broadcaster_user_id;
  if (!broadcasterId) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) return;

  const admin = createTwitchAdminClient();
  await admin
    .from("twitch_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("user_id", connection.user_id)
    .eq("status", "active");
}

async function handleChannelUpdate(event: ChannelUpdateEvent) {
  const broadcasterId = event.broadcaster_user_id;
  const categoryId = event.category_id;
  if (!broadcasterId || !categoryId) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) return;

  const admin = createTwitchAdminClient();
  // Update both 'active' and 'test' sessions — the streamer's current
  // Twitch category is the source of truth for which randomizer the bot
  // uses, regardless of how the session was started.
  const { data: openSessions } = await admin
    .from("twitch_sessions")
    .select("id, twitch_category_id, status")
    .eq("user_id", connection.user_id)
    .in("status", ["active", "test"]);

  if (!openSessions || openSessions.length === 0) return;

  const slug = await resolveRandomizerSlug(categoryId, event.category_name ?? null);

  for (const session of openSessions) {
    if (session.twitch_category_id === categoryId) continue;
    // Update the session's category + slug. slug may be null when the
    // streamer switches to an unsupported category — commands will then
    // reply with the "not supported" message rather than running. The
    // session itself stays open so the bot can recover when they switch
    // back to a supported game.
    await admin
      .from("twitch_sessions")
      .update({ twitch_category_id: categoryId, randomizer_slug: slug })
      .eq("id", session.id);
  }
}
