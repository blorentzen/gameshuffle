/**
 * POST /api/twitch/channel-points
 *
 * Body: { action: 'enable', cost?: number }
 *      | { action: 'disable' }
 *      | { action: 'update_cost', cost: number }
 *
 * Manages the streamer's "🎲 GameShuffle: Randomize My Combo" channel
 * point reward end-to-end: creates the reward via Helix, subscribes to
 * the redemption EventSub, persists state on twitch_connections.
 *
 * Requires Twitch Affiliate or Partner status — non-affiliate calls
 * fail with 403 from Helix and we surface that as a friendly error.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  createCustomReward,
  deleteCustomReward,
} from "@/lib/twitch/channelPoints";
import {
  subscribeToChannelPointRedemption,
  unsubscribeFromChannelPointRedemption,
} from "@/lib/twitch/eventsub";

export const runtime = "nodejs";

const REWARD_TITLE = "🎲 GameShuffle: Reroll the Streamer's Combo";
const REWARD_PROMPT =
  "Force the streamer to shuffle to a new random Mario Kart loadout. The new combo is posted in chat and shown on the overlay.";
const MIN_COST = 1;
const MAX_COST = 1_000_000;

interface ConnectionRow {
  id: string;
  twitch_user_id: string;
  channel_points_enabled: boolean;
  channel_point_reward_id: string | null;
  channel_point_cost: number;
}

function clampCost(input: unknown, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < MIN_COST) return MIN_COST;
  if (i > MAX_COST) return MAX_COST;
  return i;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;
  if (!action || !["enable", "disable", "update_cost"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_connections")
    .select(
      "id, twitch_user_id, channel_points_enabled, channel_point_reward_id, channel_point_cost"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const connection = (data as ConnectionRow | null) ?? null;
  if (!connection?.twitch_user_id) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  if (action === "enable") {
    const cost = clampCost(body.cost, connection.channel_point_cost ?? 500);

    // If a reward already exists, delete it before re-creating so we
    // don't leak orphaned rewards on Twitch.
    if (connection.channel_point_reward_id) {
      try {
        await deleteCustomReward({
          userId: user.id,
          broadcasterTwitchId: connection.twitch_user_id,
          rewardId: connection.channel_point_reward_id,
        });
      } catch (err) {
        console.warn("[twitch-channel-points] stale reward delete failed:", err);
      }
      await unsubscribeFromChannelPointRedemption(user.id);
    }

    let reward;
    try {
      reward = await createCustomReward({
        userId: user.id,
        broadcasterTwitchId: connection.twitch_user_id,
        title: REWARD_TITLE,
        cost,
        prompt: REWARD_PROMPT,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("403")) {
        return NextResponse.json(
          { error: "not_affiliate", message: "Twitch requires Affiliate or Partner status to create channel point rewards." },
          { status: 403 }
        );
      }
      console.error("[twitch-channel-points] create reward failed:", err);
      return NextResponse.json({ error: "create_failed", message }, { status: 502 });
    }

    try {
      await subscribeToChannelPointRedemption({
        userId: user.id,
        twitchUserId: connection.twitch_user_id,
        rewardId: reward.id,
      });
    } catch (err) {
      console.error("[twitch-channel-points] subscribe failed:", err);
      // Roll back the reward — we don't want a reward that nobody listens to.
      try {
        await deleteCustomReward({
          userId: user.id,
          broadcasterTwitchId: connection.twitch_user_id,
          rewardId: reward.id,
        });
      } catch {
        // best-effort cleanup
      }
      return NextResponse.json({ error: "subscribe_failed" }, { status: 502 });
    }

    await admin
      .from("twitch_connections")
      .update({
        channel_points_enabled: true,
        channel_point_reward_id: reward.id,
        channel_point_cost: cost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.json({ success: true, rewardId: reward.id, cost });
  }

  if (action === "disable") {
    if (connection.channel_point_reward_id) {
      try {
        await deleteCustomReward({
          userId: user.id,
          broadcasterTwitchId: connection.twitch_user_id,
          rewardId: connection.channel_point_reward_id,
        });
      } catch (err) {
        console.warn("[twitch-channel-points] reward delete failed:", err);
      }
    }
    try {
      await unsubscribeFromChannelPointRedemption(user.id);
    } catch (err) {
      console.warn("[twitch-channel-points] unsubscribe failed:", err);
    }

    await admin
      .from("twitch_connections")
      .update({
        channel_points_enabled: false,
        channel_point_reward_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.json({ success: true });
  }

  // update_cost: when enabled, recreate the reward at the new cost
  // (Twitch doesn't allow PATCHing certain reward fields cleanly when
  // managed by another app, so a delete+create is the most reliable
  // approach). When disabled, just persist the new default for next
  // enable.
  const cost = clampCost(body.cost, connection.channel_point_cost);

  if (!connection.channel_points_enabled || !connection.channel_point_reward_id) {
    await admin
      .from("twitch_connections")
      .update({ channel_point_cost: cost, updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    return NextResponse.json({ success: true, cost });
  }

  // Recreate path
  try {
    await deleteCustomReward({
      userId: user.id,
      broadcasterTwitchId: connection.twitch_user_id,
      rewardId: connection.channel_point_reward_id,
    });
  } catch (err) {
    console.warn("[twitch-channel-points] cost-update delete failed:", err);
  }
  await unsubscribeFromChannelPointRedemption(user.id);

  let reward;
  try {
    reward = await createCustomReward({
      userId: user.id,
      broadcasterTwitchId: connection.twitch_user_id,
      title: REWARD_TITLE,
      cost,
      prompt: REWARD_PROMPT,
    });
  } catch (err) {
    console.error("[twitch-channel-points] cost-update create failed:", err);
    await admin
      .from("twitch_connections")
      .update({ channel_points_enabled: false, channel_point_reward_id: null })
      .eq("id", connection.id);
    return NextResponse.json({ error: "create_failed" }, { status: 502 });
  }
  await subscribeToChannelPointRedemption({
    userId: user.id,
    twitchUserId: connection.twitch_user_id,
    rewardId: reward.id,
  });

  await admin
    .from("twitch_connections")
    .update({
      channel_point_reward_id: reward.id,
      channel_point_cost: cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return NextResponse.json({ success: true, rewardId: reward.id, cost });
}
