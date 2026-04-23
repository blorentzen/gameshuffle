/**
 * EventSub subscription manager for Twitch streamer integrations.
 *
 * Phase 1 subscribes to:
 *   - channel.update      v2  (category changes)
 *   - stream.online       v1  (start session)
 *   - stream.offline      v1  (end session)
 *
 * Future phases will add channel.chat.message and channel point redemption
 * events. Subscriptions are tracked in `twitch_eventsub_subscriptions` so
 * the disconnect flow can clean them up cleanly.
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
}

/** EventSub subscription types created on initial connection. */
export const PHASE_1_SUBSCRIPTION_TYPES: SubscriptionTypeConfig[] = [
  { type: "channel.update", version: "2" },
  { type: "stream.online", version: "1" },
  { type: "stream.offline", version: "1" },
];

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

  for (const cfg of PHASE_1_SUBSCRIPTION_TYPES) {
    try {
      const sub = await createEventSubSubscription({
        type: cfg.type,
        version: cfg.version,
        condition: { broadcaster_user_id: args.twitchUserId },
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
