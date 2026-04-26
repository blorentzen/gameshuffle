/**
 * Reusable Twitch integration teardown. Used by:
 *   - POST /api/twitch/disconnect (user-initiated)
 *   - Stripe webhook on subscription cancellation (forced cleanup when
 *     the Pro tier lapses per gs-subscription-architecture.md §5)
 *
 * Steps in reverse of setup so tokens stay valid long enough to revoke
 * the channel point reward:
 *   1. Delete the channel point reward (needs user token)
 *   2. Revoke the OAuth token
 *   3. Delete EventSub subscriptions
 *   4. Delete the twitch_connections row (CASCADE clears sessions /
 *      participants / shuffle events / eventsub subscription rows)
 *
 * Best-effort at every step — if Twitch rejects the reward delete, we
 * log and continue. We'd rather leave one orphaned reward than abandon
 * the entire cleanup halfway through.
 */

import { createTwitchAdminClient } from "./admin";
import { decryptToken, TwitchCryptoError } from "./crypto";
import { deleteCustomReward } from "./channelPoints";
import { revokeToken } from "./client";
import { unsubscribeAllForUser } from "./eventsub";

export interface DisconnectResult {
  alreadyDisconnected: boolean;
  deletedRewardId: string | null;
  revokedToken: boolean;
  unsubscribedEventSub: boolean;
  deletedConnection: boolean;
}

export async function disconnectTwitchIntegration(
  userId: string
): Promise<DisconnectResult> {
  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select(
      "id, access_token_encrypted, twitch_user_id, channel_points_enabled, channel_point_reward_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection) {
    return {
      alreadyDisconnected: true,
      deletedRewardId: null,
      revokedToken: false,
      unsubscribedEventSub: false,
      deletedConnection: false,
    };
  }

  let deletedRewardId: string | null = null;
  if (connection.channel_point_reward_id && connection.twitch_user_id) {
    try {
      await deleteCustomReward({
        userId,
        broadcasterTwitchId: connection.twitch_user_id,
        rewardId: connection.channel_point_reward_id,
      });
      deletedRewardId = connection.channel_point_reward_id;
    } catch (err) {
      console.warn(
        "[twitch-disconnect] channel point reward delete failed:",
        err
      );
    }
  }

  let revokedToken = false;
  if (connection.access_token_encrypted) {
    try {
      const accessToken = decryptToken(connection.access_token_encrypted);
      await revokeToken(accessToken);
      revokedToken = true;
    } catch (err) {
      if (err instanceof TwitchCryptoError) {
        console.warn(
          "[twitch-disconnect] could not decrypt token to revoke:",
          err.message
        );
      } else {
        console.error("[twitch-disconnect] revoke failed:", err);
      }
    }
  }

  let unsubscribedEventSub = false;
  try {
    await unsubscribeAllForUser(userId);
    unsubscribedEventSub = true;
  } catch (err) {
    console.error("[twitch-disconnect] EventSub unsubscribe failed:", err);
  }

  const { error: deleteErr } = await admin
    .from("twitch_connections")
    .delete()
    .eq("id", connection.id);

  if (deleteErr) {
    console.error("[twitch-disconnect] connection delete failed:", deleteErr);
    throw new Error(`connection delete failed: ${deleteErr.message}`);
  }

  return {
    alreadyDisconnected: false,
    deletedRewardId,
    revokedToken,
    unsubscribedEventSub,
    deletedConnection: true,
  };
}
