/**
 * Multi-reward channel-point actions (Streamer Tools Integration, Phase 0).
 *
 * Maps a Twitch custom-reward id → a tool action for a streamer. The webhook
 * looks this up BEFORE the legacy combo-reroll path, so new tool rewards never
 * touch the existing reward. Each action dispatches to the tool's shared
 * trigger fn (the same one chat + Hub use).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { triggerDiceRoll } from "@/lib/overlay/tools/dice";

export interface ChannelPointAction {
  id: string;
  actionType: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export async function getChannelPointAction(
  ownerUserId: string,
  rewardId: string,
): Promise<ChannelPointAction | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_channel_point_actions")
    .select("id, action_type, config, enabled")
    .eq("owner_user_id", ownerUserId)
    .eq("reward_id", rewardId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; action_type: string; config: Record<string, unknown> | null; enabled: boolean };
  return { id: row.id, actionType: row.action_type, config: row.config ?? {}, enabled: row.enabled === true };
}

/** Run a redeemed action. Returns a chat message to post (if any) and ok. */
export async function dispatchChannelPointAction(
  action: ChannelPointAction,
  args: { ownerUserId: string; sessionId?: string | null; triggeredBy: string },
): Promise<{ ok: boolean; message?: string }> {
  switch (action.actionType) {
    case "dice": {
      const count = typeof action.config.count === "number" ? (action.config.count as number) : undefined;
      const res = await triggerDiceRoll({
        ownerUserId: args.ownerUserId,
        sessionId: args.sessionId ?? null,
        count,
        triggeredBy: args.triggeredBy,
        source: "channel_point",
      });
      const message =
        res.values.length > 1
          ? `🎲 ${args.triggeredBy} rolled ${res.values.join(" + ")} = ${res.total}`
          : `🎲 ${args.triggeredBy} rolled ${res.values[0]}`;
      return { ok: true, message };
    }
    default:
      return { ok: false };
  }
}
