/**
 * EventSub subscription manager for Twitch streamer integrations.
 *
 * Subscribes to:
 *   - channel.update        v2  (category changes)
 *   - stream.online         v1  (start session)
 *   - stream.offline        v1  (end session)
 *   - channel.chat.message  v1  (bot reads chat for !gs-* commands)
 *
 * Subscriptions are tracked in `twitch_eventsub_subscriptions` so the
 * disconnect flow can clean them up and the sync endpoint can repair
 * missing ones without requiring a reconnect.
 */

import {
  createEventSubSubscription,
  deleteEventSubSubscription,
  type EventSubSubscription,
} from "./client";
import { createTwitchAdminClient } from "./admin";

export interface SubscriptionTypeConfig {
  type: string;
  version: string;
  /** Whether this subscription needs the bot's user_id in the condition. */
  requiresBotUser?: boolean;
}

/** All EventSub subscription types we need per connection. */
export const REQUIRED_SUBSCRIPTION_TYPES: SubscriptionTypeConfig[] = [
  { type: "channel.update", version: "2" },
  { type: "stream.online", version: "1" },
  { type: "stream.offline", version: "1" },
  { type: "channel.chat.message", version: "1", requiresBotUser: true },
];

function botUserId(): string {
  const id = process.env.TWITCH_BOT_USER_ID;
  if (!id) {
    throw new Error(
      "TWITCH_BOT_USER_ID env var is not set. Required for channel.chat.message subscriptions."
    );
  }
  return id;
}

function buildCondition(cfg: SubscriptionTypeConfig, twitchUserId: string) {
  const condition: Record<string, string> = { broadcaster_user_id: twitchUserId };
  if (cfg.requiresBotUser) {
    condition.user_id = botUserId();
  }
  return condition;
}

function webhookCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.gameshuffle.co";
  return `${base}/api/twitch/webhook`;
}

function eventsubSecret(): string {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) throw new Error("TWITCH_EVENTSUB_SECRET env var is not set");
  if (secret.length < 10) {
    throw new Error("TWITCH_EVENTSUB_SECRET must be at least 10 characters (Twitch requirement)");
  }
  return secret;
}

/**
 * Create EventSub subscriptions for a freshly-connected streamer.
 * Stores returned subscription IDs in twitch_eventsub_subscriptions.
 *
 * Failures on individual subscriptions are logged but don't abort the others —
 * we'd rather have partial coverage than total failure mid-OAuth.
 */
export async function subscribeForConnection(args: {
  userId: string;
  twitchUserId: string;
}): Promise<{ created: EventSubSubscription[]; failures: { type: string; error: string }[] }> {
  const supabase = createTwitchAdminClient();
  const created: EventSubSubscription[] = [];
  const failures: { type: string; error: string }[] = [];

  for (const cfg of REQUIRED_SUBSCRIPTION_TYPES) {
    try {
      const sub = await createEventSubSubscription({
        type: cfg.type,
        version: cfg.version,
        condition: buildCondition(cfg, args.twitchUserId),
        callback: webhookCallbackUrl(),
        secret: eventsubSecret(),
      });

      await supabase.from("twitch_eventsub_subscriptions").insert({
        user_id: args.userId,
        twitch_subscription_id: sub.id,
        type: sub.type,
        status: sub.status,
      });

      created.push(sub);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[twitch] EventSub subscribe failed (${cfg.type}):`, message);
      failures.push({ type: cfg.type, error: message });
    }
  }

  return { created, failures };
}

/**
 * Idempotent: creates any REQUIRED subscription types missing for a
 * connection. Used to backfill existing connections when we add a new
 * subscription type (e.g. channel.chat.message in Phase 2) without
 * forcing a disconnect/reconnect.
 *
 * Also flips locally-stored rows for types we no longer recognize to
 * give the health indicator something meaningful to show — the Twitch
 * side stays untouched.
 */
export async function syncSubscriptionsForConnection(args: {
  userId: string;
  twitchUserId: string;
}): Promise<{ created: EventSubSubscription[]; alreadyPresent: string[]; failures: { type: string; error: string }[] }> {
  const supabase = createTwitchAdminClient();
  const { data: existing } = await supabase
    .from("twitch_eventsub_subscriptions")
    .select("type, status")
    .eq("user_id", args.userId);

  const existingByType = new Map<string, string>();
  for (const row of existing ?? []) {
    existingByType.set(row.type as string, (row.status as string) ?? "unknown");
  }

  const created: EventSubSubscription[] = [];
  const alreadyPresent: string[] = [];
  const failures: { type: string; error: string }[] = [];

  for (const cfg of REQUIRED_SUBSCRIPTION_TYPES) {
    const prior = existingByType.get(cfg.type);
    if (prior === "enabled") {
      alreadyPresent.push(cfg.type);
      continue;
    }
    try {
      const sub = await createEventSubSubscription({
        type: cfg.type,
        version: cfg.version,
        condition: buildCondition(cfg, args.twitchUserId),
        callback: webhookCallbackUrl(),
        secret: eventsubSecret(),
      });

      // Clear any stale row for this type, then insert the fresh one
      await supabase
        .from("twitch_eventsub_subscriptions")
        .delete()
        .eq("user_id", args.userId)
        .eq("type", cfg.type);

      await supabase.from("twitch_eventsub_subscriptions").insert({
        user_id: args.userId,
        twitch_subscription_id: sub.id,
        type: sub.type,
        status: sub.status,
      });

      created.push(sub);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[twitch] EventSub sync failed (${cfg.type}):`, message);
      failures.push({ type: cfg.type, error: message });
    }
  }

  return { created, alreadyPresent, failures };
}

/**
 * Delete all EventSub subscriptions for a user (called from /disconnect).
 * Best-effort: continues even if individual deletes fail.
 */
export async function unsubscribeAllForUser(userId: string): Promise<void> {
  const supabase = createTwitchAdminClient();
  const { data: subs } = await supabase
    .from("twitch_eventsub_subscriptions")
    .select("id, twitch_subscription_id")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  for (const sub of subs) {
    try {
      await deleteEventSubSubscription(sub.twitch_subscription_id);
    } catch (err) {
      console.error(`[twitch] EventSub delete failed (${sub.twitch_subscription_id}):`, err);
    }
  }

  await supabase.from("twitch_eventsub_subscriptions").delete().eq("user_id", userId);
}

/**
 * Update the stored status of a subscription based on a webhook event
 * (e.g. when Twitch sends a `revocation` notification, mark it as revoked
 * so the dashboard's health indicator catches it).
 */
export async function recordSubscriptionStatus(
  subscriptionId: string,
  status: string
): Promise<void> {
  const supabase = createTwitchAdminClient();
  await supabase
    .from("twitch_eventsub_subscriptions")
    .update({ status })
    .eq("twitch_subscription_id", subscriptionId);
}
