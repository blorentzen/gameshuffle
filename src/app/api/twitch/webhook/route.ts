/**
 * POST /api/twitch/webhook
 *
 * Twitch EventSub webhook receiver. Phase 1 handles:
 *   - webhook_callback_verification (HMAC challenge response)
 *   - notification: stream.online   → open a gs_sessions row via createTwitchBoundSession
 *   - notification: stream.offline  → start the Phase 2 grace timer on the active session
 *   - notification: channel.update  → update active session category if relevant
 *   - revocation                    → record subscription status change
 *
 * EventSub delivery is at-least-once, so every message_id is recorded in
 * twitch_webhook_events_processed for dedupe. Signature verification uses
 * TWITCH_EVENTSUB_SECRET (HMAC-SHA256 over message_id + timestamp + body).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { randomizeKartCombo } from "@/lib/randomizer";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getChannelInfo, sendChatMessage } from "@/lib/twitch/client";
import { recordSubscriptionStatus } from "@/lib/twitch/eventsub";
import { resolveRandomizerSlug } from "@/lib/twitch/categories";
import { updateRedemptionStatus } from "@/lib/twitch/channelPoints";
import { getTwitchGame } from "@/lib/twitch/games";
import { parseCommand } from "@/lib/twitch/commands/parse";
import { dispatchCommand } from "@/lib/twitch/commands/dispatch";
import { buildChatDedupeKey } from "@/lib/twitch/dedupe";
import {
  formatCombo,
  randomizerPausedMessage,
  randomizerSwitchedMessage,
  redemptionRefundNotRunningMessage,
  redemptionRefundNotSupportedMessage,
  redemptionRerollMessage,
} from "@/lib/twitch/commands/messages";
import { ensureBroadcasterInSession } from "@/lib/twitch/commands/participants";
import { ensureSessionModule } from "@/lib/modules/store";
import { getGameName } from "@/data/game-registry";
import {
  createTwitchBoundSession,
  endAllTwitchSessionsForUser,
  findTwitchParticipant,
  insertTwitchParticipant,
  leaveAllTwitchParticipantsExcept,
  listOpenTwitchSessionsForUser,
  patchTwitchParticipantById,
  recordTwitchShuffleEvent,
  updateTwitchSessionCategory,
} from "@/lib/sessions/twitch-platform";
import {
  cancelGracePeriod,
  getActiveSessionForOwner,
  startGracePeriod,
} from "@/lib/sessions/service";
import { TwitchAdapter } from "@/lib/adapters/twitch";

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

  // Compute composite dedupe key for chat messages. Twitch is observed
  // (Phase 4A.1 bug, 2026-04-29) to send duplicate `channel.chat.message`
  // notifications under different message_ids ~50ms apart — message_id
  // alone wasn't enough. Composite key lives alongside the message_id so
  // a duplicate notification is rejected on either constraint.
  const dedupeKey = buildDedupeKeyForRequest(messageType, ts, rawBody);

  // Dedupe by message_id (PK) — fast path for Twitch's normal retries.
  const { data: existing } = await admin
    .from("twitch_webhook_events_processed")
    .select("message_id")
    .eq("message_id", messageId)
    .maybeSingle();

  if (existing) {
    return new Response("ok", { status: 200 });
  }

  // Record both keys atomically. PK conflict OR composite-key conflict
  // (23505 on either index) means another concurrent invocation beat us
  // — bail with 200 so Twitch doesn't retry.
  const { error: insertErr } = await admin
    .from("twitch_webhook_events_processed")
    .insert({ message_id: messageId, dedupe_key: dedupeKey });
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

/**
 * Compute the composite dedupe key for a webhook delivery, or null when
 * the event type doesn't need composite dedupe (the message_id PK
 * suffices for stream.online / channel.update / etc., where Twitch
 * doesn't duplicate-deliver under different message_ids).
 *
 * Per Phase 4A.1 (gs-pro-v1-phase-4a-double-fire-fix.md), only chat
 * messages need the stronger key today. Other event types may be added
 * later as observations warrant.
 */
function buildDedupeKeyForRequest(
  messageType: string,
  timestampMs: number,
  rawBody: string
): string | null {
  if (messageType !== "notification") return null;
  let payload: NotificationPayload;
  try {
    payload = JSON.parse(rawBody) as NotificationPayload;
  } catch {
    return null;
  }
  if (payload.subscription?.type !== "channel.chat.message") return null;
  const event = payload.event as ChatMessageEvent | undefined;
  const broadcasterId = event?.broadcaster_user_id;
  const senderId = event?.chatter_user_id;
  const text = event?.message?.text;
  if (!broadcasterId || !senderId || !text) return null;
  return buildChatDedupeKey({
    broadcasterId,
    senderId,
    text,
    timestampMs,
  });
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
    case "channel.channel_points_custom_reward_redemption.add":
      await handleChannelPointRedemption(event as RedemptionEvent);
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
    overlayToken: connection.overlay_token,
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
  twitch_login: string | null;
  twitch_display_name: string | null;
  overlay_token: string | null;
  channel_points_enabled: boolean | null;
  channel_point_reward_id: string | null;
}

async function getConnectionByTwitchUserId(twitchUserId: string): Promise<ConnectionRow | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_connections")
    .select(
      "user_id, twitch_user_id, twitch_login, twitch_display_name, overlay_token, channel_points_enabled, channel_point_reward_id"
    )
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

  // Phase 2 grace-period reconnect: if the streamer already has an active
  // session in grace (from a prior stream.offline + a recent reconnect),
  // cancel grace and let the existing session continue. Per spec §7.1.
  const activeSession = await getActiveSessionForOwner(connection.user_id);
  if (activeSession?.grace_period_expires_at) {
    await cancelGracePeriod(activeSession.id);
    console.log(
      `[twitch-webhook] stream.online cancelled grace for session ${activeSession.id}`
    );
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

  // Close any stale sessions first — defense against missed offline events
  // and any test sessions left open. Both flow into 'ended' status.
  await endAllTwitchSessionsForUser(connection.user_id);

  const newSession = await createTwitchBoundSession({
    userId: connection.user_id,
    randomizerSlug: slug,
    twitchCategoryId: categoryId,
    isTest: false,
  });

  if (newSession) {
    await ensureBroadcasterInSession({
      sessionId: newSession.id,
      twitchUserId: connection.twitch_user_id,
      twitchLogin: connection.twitch_login ?? broadcasterId,
      twitchDisplayName: connection.twitch_display_name ?? connection.twitch_login ?? broadcasterId,
    });
    // Auto-enable the kart_randomizer module for every fresh session — it's
    // the existing default behavior, just now expressed through the modules
    // table so future modules slot in next to it. Per gs-feature-modules-picks-bans.md §3.
    await ensureSessionModule({
      sessionId: newSession.id,
      moduleId: "kart_randomizer",
    });
  }
}

async function handleStreamOffline(event: StreamOfflineEvent) {
  const broadcasterId = event.broadcaster_user_id;
  if (!broadcasterId) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) return;

  // Phase 2 grace period: instead of ending the live session immediately,
  // start a 1h grace timer. If stream.online arrives before the timer
  // expires, the session continues. If grace expires, the lifecycle cron
  // sweep transitions the session to `ending`. Per spec §7.2 + §2.3.
  //
  // Test sessions are deliberately disjoint from the streamer's live
  // state — they don't get a grace period.
  const activeSession = await getActiveSessionForOwner(connection.user_id);
  if (!activeSession) return;
  const isTestSession = !!(activeSession.feature_flags as { test_session?: boolean })
    ?.test_session;
  if (isTestSession) return;

  await startGracePeriod(activeSession.id);
  console.log(
    `[twitch-webhook] stream.offline started grace for session ${activeSession.id}`
  );
}

async function handleChannelUpdate(event: ChannelUpdateEvent) {
  const broadcasterId = event.broadcaster_user_id;
  const categoryId = event.category_id;
  if (!broadcasterId || !categoryId) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) return;

  // Update all open sessions (including test sessions) — the streamer's
  // current Twitch category is the source of truth for which randomizer
  // the bot uses, regardless of how the session was started.
  const openSessions = await listOpenTwitchSessionsForUser(connection.user_id);
  if (openSessions.length === 0) return;

  // Sessions should all share the same slug (same streamer), so grab the
  // first one to compare against for the announcement decision.
  const firstSession = openSessions[0];
  const previousSlug = firstSession?.randomizer_slug ?? null;

  const slug = await resolveRandomizerSlug(categoryId, event.category_name ?? null);

  let updated = false;
  const updatedSessionIds: string[] = [];
  for (const session of openSessions) {
    if (session.twitch_category_id === categoryId) continue;
    // slug may be null when the streamer switches to an unsupported
    // category — commands will then reply with the "not supported"
    // message rather than running. The session itself stays open so the
    // bot can recover when they switch back to a supported game.
    await updateTwitchSessionCategory(session.id, slug, categoryId);
    updated = true;
    updatedSessionIds.push(session.id);
  }

  // Skip downstream work if nothing actually changed (redundant
  // channel.update fires) or if the slug is still the same (e.g., two
  // category IDs mapping to the same randomizer).
  if (!updated || previousSlug === slug) return;

  // Different game means the existing lobby's combos don't apply — clear
  // all active viewers from the session so the next !gs-join is a fresh
  // start. The broadcaster stays in (and gets re-seated below). Combos
  // stay on the row for audit but won't be returned by !gs-mycombo
  // because the row is in a 'left' state.
  if (updatedSessionIds.length > 0) {
    await leaveAllTwitchParticipantsExcept(
      updatedSessionIds,
      connection.twitch_user_id,
      "session_ended"
    );

    // Re-seat the broadcaster on each updated session — clears their
    // stale combo and ensures they're shown in !gs-lobby.
    for (const sessionId of updatedSessionIds) {
      await ensureBroadcasterInSession({
        sessionId,
        twitchUserId: connection.twitch_user_id,
        twitchLogin: connection.twitch_login ?? broadcasterId,
        twitchDisplayName: connection.twitch_display_name ?? connection.twitch_login ?? broadcasterId,
      });
    }
  }

  try {
    const message = slug
      ? randomizerSwitchedMessage(getGameName(slug))
      : randomizerPausedMessage(event.category_name ?? null);
    // Route through the adapter for any one of the updated sessions —
    // they all share the same streamer's chat, so a single post is the
    // correct behavior. Pick the first as the carrier.
    const carrierSessionId = updatedSessionIds[0];
    if (carrierSessionId) {
      const adapter = new TwitchAdapter({
        sessionId: carrierSessionId,
        ownerUserId: connection.user_id,
      });
      await adapter.postChatMessage(message);
    }
  } catch (err) {
    console.error("[twitch-webhook] category-switch announce failed:", err);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Channel point redemption → run shuffle, fulfill or refund
// ───────────────────────────────────────────────────────────────────────

interface RedemptionEvent {
  id?: string;
  broadcaster_user_id?: string;
  user_id?: string;
  user_login?: string;
  user_name?: string;
  reward?: { id?: string };
  status?: string;
}

async function refundRedemption(args: {
  userId: string;
  broadcasterTwitchId: string;
  rewardId: string;
  redemptionId: string;
  reason?: string;
}): Promise<void> {
  try {
    await updateRedemptionStatus({
      userId: args.userId,
      broadcasterTwitchId: args.broadcasterTwitchId,
      rewardId: args.rewardId,
      redemptionId: args.redemptionId,
      status: "CANCELED",
    });
  } catch (err) {
    console.error(
      `[twitch-webhook] refund failed (${args.reason ?? "unknown"}):`,
      err
    );
  }
}

async function fulfillRedemption(args: {
  userId: string;
  broadcasterTwitchId: string;
  rewardId: string;
  redemptionId: string;
}): Promise<void> {
  try {
    await updateRedemptionStatus({
      userId: args.userId,
      broadcasterTwitchId: args.broadcasterTwitchId,
      rewardId: args.rewardId,
      redemptionId: args.redemptionId,
      status: "FULFILLED",
    });
  } catch (err) {
    console.error("[twitch-webhook] fulfill failed:", err);
  }
}

async function handleChannelPointRedemption(event: RedemptionEvent) {
  const broadcasterId = event.broadcaster_user_id;
  const viewerDisplayName = event.user_name || event.user_login || "viewer";
  const rewardId = event.reward?.id;
  const redemptionId = event.id;
  if (!broadcasterId || !event.user_id || !rewardId || !redemptionId) return;

  const connection = await getConnectionByTwitchUserId(broadcasterId);
  if (!connection) return;

  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId) {
    console.warn("[twitch-webhook] TWITCH_BOT_USER_ID missing — skipping redemption");
    return;
  }

  // Defense-in-depth: only act on redemptions of the reward currently
  // configured for this connection. Stale subscriptions for old reward
  // IDs would otherwise trigger phantom shuffles.
  if (
    !connection.channel_points_enabled ||
    connection.channel_point_reward_id !== rewardId
  ) {
    return;
  }

  // Find an active or test session, prefer live.
  const open = await listOpenTwitchSessionsForUser(connection.user_id);
  // Sort: live first, then by recency. listOpenTwitchSessionsForUser already
  // returns rows ordered by activated_at — but it doesn't distinguish test
  // vs live in the underlying status. Tier order: prefer non-test first.
  open.sort((a, b) => {
    if (a.status === "test" && b.status !== "test") return 1;
    if (a.status !== "test" && b.status === "test") return -1;
    return 0;
  });
  const session = open[0] ?? null;

  if (!session) {
    // No active session — fall back to direct chat. Adapter requires a
    // session to instantiate; the message itself explains the refund.
    await sendChatMessage({
      broadcasterId,
      senderId: botId,
      message: redemptionRefundNotRunningMessage(viewerDisplayName),
    });
    await refundRedemption({
      userId: connection.user_id,
      broadcasterTwitchId: broadcasterId,
      rewardId,
      redemptionId,
      reason: "no_active_session",
    });
    return;
  }

  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: connection.user_id,
  });

  const game = getTwitchGame(session.randomizer_slug);
  if (!game) {
    await adapter.postChatMessage(redemptionRefundNotSupportedMessage(viewerDisplayName));
    await refundRedemption({
      userId: connection.user_id,
      broadcasterTwitchId: broadcasterId,
      rewardId,
      redemptionId,
      reason: "unsupported_game",
    });
    return;
  }

  // Redemption → reroll the STREAMER's combo. Viewer triggers; streamer
  // is the target. Lobby membership isn't required from the viewer;
  // they're just paying to shake up the streamer's loadout.
  const streamerDisplayName =
    connection.twitch_display_name ?? connection.twitch_login ?? "streamer";
  const streamerLogin = connection.twitch_login ?? "";
  const combo = randomizeKartCombo(game.data, [], [], []);

  const broadcasterRow = await findTwitchParticipant({
    sessionId: session.id,
    twitchUserId: connection.twitch_user_id,
  });

  if (broadcasterRow) {
    await patchTwitchParticipantById(broadcasterRow.id, {
      left_at: null,
      left_reason: null,
      rejoin_eligible_at: null,
      kick_until: null,
      twitch_login: streamerLogin,
      twitch_display_name: streamerDisplayName,
      current_combo: combo as unknown as Record<string, unknown>,
      current_combo_at: new Date().toISOString(),
    });
  } else {
    // Defensive — sessions auto-seat the broadcaster, but a stale row
    // could be missing. Insert fresh.
    await insertTwitchParticipant({
      sessionId: session.id,
      twitchUserId: connection.twitch_user_id,
      twitchLogin: streamerLogin,
      twitchDisplayName: streamerDisplayName,
      isBroadcaster: true,
      currentCombo: combo as unknown as Record<string, unknown>,
      currentComboAt: new Date().toISOString(),
    });
  }

  // Log as a broadcaster shuffle so the overlay fires. Trigger type
  // still records it as channel_points for the dashboard's audit feed.
  await recordTwitchShuffleEvent({
    sessionId: session.id,
    twitchUserId: connection.twitch_user_id,
    twitchDisplayName: streamerDisplayName,
    triggerType: "channel_points",
    combo: combo as unknown as Record<string, unknown>,
    isBroadcaster: true,
  });

  await adapter.postChatMessage(
    redemptionRerollMessage({
      viewerDisplayName,
      streamerDisplayName,
      comboText: formatCombo(combo, game),
    })
  );

  await fulfillRedemption({
    userId: connection.user_id,
    broadcasterTwitchId: broadcasterId,
    rewardId,
    redemptionId,
  });
}
