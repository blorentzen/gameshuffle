/**
 * POST /api/twitch/channel-points
 *
 * Body: { action: 'enable', cost?: number }
 *      | { action: 'disable' }
 *      | { action: 'update_cost', cost: number }
 *
 * Manages the streamer's "🎲 GameShuffle: Reroll the Streamer's Combo"
 * channel point reward end-to-end.
 *
 * Strategy (Phase 4B.1 fix for CREATE_CUSTOM_REWARD_DUPLICATE_REWARD):
 *   - enable     — find-or-adopt the manageable reward by title; if
 *                  found, PATCH cost+enabled. If not, create. Either
 *                  way ensure EventSub is subscribed to the resulting
 *                  reward id.
 *   - update_cost — find the reward by stored id (or by title fallback)
 *                  and PATCH cost. No delete/recreate.
 *   - disable    — DELETE the reward + unsubscribe.
 *
 * The adoption flow ensures we recover gracefully when:
 *   (a) a previous create succeeded on Twitch but our DB write didn't,
 *       leaving an orphan reward with our title
 *   (b) the streamer removed the reward manually but our DB still has
 *       the id
 *   (c) the streamer or another app created a reward with the exact
 *       same title before — adoption only succeeds for rewards
 *       manageable by THIS app's client_id, so a non-GameShuffle
 *       reward of the same name still fails (fix is to rename theirs)
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
  listManageableRewards,
  updateCustomReward,
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

function helixErrorToResponse(err: unknown, defaultStatus = 502) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("403")) {
    return NextResponse.json(
      {
        error: "not_affiliate",
        message:
          "Twitch requires Affiliate or Partner status to manage channel point rewards.",
      },
      { status: 403 }
    );
  }
  if (message.includes("CREATE_CUSTOM_REWARD_DUPLICATE_REWARD")) {
    return NextResponse.json(
      {
        error: "duplicate_reward_unmanageable",
        message:
          "A reward with this name already exists in your channel and isn't manageable by GameShuffle. Rename or delete that reward in Twitch's reward manager, then try again.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: "helix_error", message }, { status: defaultStatus });
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

    // Find-or-create: list rewards manageable by this app, look for our
    // title, adopt if present (PATCH cost + ensure enabled), create
    // otherwise.
    let rewardId: string | null = null;
    try {
      const existing = await listManageableRewards({
        userId: user.id,
        broadcasterTwitchId: connection.twitch_user_id,
      });
      const owned = existing.find((r) => r.title === REWARD_TITLE);
      if (owned) {
        const updated = await updateCustomReward({
          userId: user.id,
          broadcasterTwitchId: connection.twitch_user_id,
          rewardId: owned.id,
          patch: { cost, is_enabled: true, prompt: REWARD_PROMPT },
        });
        rewardId = updated.id;
      } else {
        const created = await createCustomReward({
          userId: user.id,
          broadcasterTwitchId: connection.twitch_user_id,
          title: REWARD_TITLE,
          cost,
          prompt: REWARD_PROMPT,
        });
        rewardId = created.id;
      }
    } catch (err) {
      console.error("[twitch-channel-points] enable failed:", err);
      return helixErrorToResponse(err);
    }

    // EventSub subscription is keyed on (twitch_user_id, reward_id).
    // Reset and re-subscribe so the active subscription points at the
    // current reward — handles the case where we adopted an existing
    // reward with a different id than what was previously subscribed.
    try {
      await unsubscribeFromChannelPointRedemption(user.id);
      await subscribeToChannelPointRedemption({
        userId: user.id,
        twitchUserId: connection.twitch_user_id,
        rewardId,
      });
    } catch (err) {
      console.error("[twitch-channel-points] subscribe failed:", err);
      return NextResponse.json({ error: "subscribe_failed" }, { status: 502 });
    }

    await admin
      .from("twitch_connections")
      .update({
        channel_points_enabled: true,
        channel_point_reward_id: rewardId,
        channel_point_cost: cost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.json({ success: true, rewardId, cost });
  }

  if (action === "disable") {
    // Delete the tracked reward if we have one. Also clean up any
    // residual reward of the same title on Twitch's side so a
    // subsequent enable doesn't trip CREATE_DUPLICATE.
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
      const stragglers = await listManageableRewards({
        userId: user.id,
        broadcasterTwitchId: connection.twitch_user_id,
      });
      for (const r of stragglers) {
        if (r.title !== REWARD_TITLE) continue;
        if (r.id === connection.channel_point_reward_id) continue;
        try {
          await deleteCustomReward({
            userId: user.id,
            broadcasterTwitchId: connection.twitch_user_id,
            rewardId: r.id,
          });
        } catch (err) {
          console.warn(
            `[twitch-channel-points] straggler delete failed for ${r.id}:`,
            err
          );
        }
      }
    } catch (err) {
      console.warn("[twitch-channel-points] straggler scan failed:", err);
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

  // action === "update_cost"
  const cost = clampCost(body.cost, connection.channel_point_cost);

  // If channel points are not enabled, just persist the new default.
  if (!connection.channel_points_enabled) {
    await admin
      .from("twitch_connections")
      .update({ channel_point_cost: cost, updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    return NextResponse.json({ success: true, cost });
  }

  // Resolve the reward id: prefer the stored id, fall back to a title
  // search if the stored id is missing or 404s on PATCH.
  let rewardId = connection.channel_point_reward_id;
  let updated = false;

  if (rewardId) {
    try {
      await updateCustomReward({
        userId: user.id,
        broadcasterTwitchId: connection.twitch_user_id,
        rewardId,
        patch: { cost },
      });
      updated = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 404 means the stored id no longer exists on Twitch (manual
      // delete by streamer, etc.) — fall through to title lookup.
      if (!message.includes("404") && !message.includes("Not Found")) {
        console.error("[twitch-channel-points] update_cost PATCH failed:", err);
        return helixErrorToResponse(err);
      }
      console.warn("[twitch-channel-points] stored reward id 404 — falling back to title lookup");
      rewardId = null;
    }
  }

  if (!updated) {
    try {
      const existing = await listManageableRewards({
        userId: user.id,
        broadcasterTwitchId: connection.twitch_user_id,
      });
      const owned = existing.find((r) => r.title === REWARD_TITLE);
      if (owned) {
        await updateCustomReward({
          userId: user.id,
          broadcasterTwitchId: connection.twitch_user_id,
          rewardId: owned.id,
          patch: { cost },
        });
        rewardId = owned.id;
        updated = true;
      } else {
        // No reward exists at all — flip back to disabled state and
        // tell the client to re-enable.
        await admin
          .from("twitch_connections")
          .update({
            channel_points_enabled: false,
            channel_point_reward_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
        return NextResponse.json(
          {
            error: "reward_missing",
            message:
              "The GameShuffle reward isn't on your channel anymore. Re-enable channel points to recreate it.",
          },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("[twitch-channel-points] update_cost fallback failed:", err);
      return helixErrorToResponse(err);
    }
  }

  // If we ended up with a different reward id than the stored one
  // (because we adopted via title), re-point the EventSub subscription.
  if (rewardId && rewardId !== connection.channel_point_reward_id) {
    try {
      await unsubscribeFromChannelPointRedemption(user.id);
      await subscribeToChannelPointRedemption({
        userId: user.id,
        twitchUserId: connection.twitch_user_id,
        rewardId,
      });
    } catch (err) {
      console.error(
        "[twitch-channel-points] resubscribe after id change failed:",
        err
      );
    }
  }

  await admin
    .from("twitch_connections")
    .update({
      channel_point_reward_id: rewardId,
      channel_point_cost: cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return NextResponse.json({ success: true, rewardId, cost });
}
