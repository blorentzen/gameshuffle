/**
 * `!roll` (aliases `!gs-roll`, `!dice`) — roll dice on the streamer's overlay.
 *
 * Broadcaster + mods only (gated by `minAuthority: "mod"` at dispatch). Pro-
 * gated inside the handler (silent for non-Pro so it never spams chat).
 * Session-independent, like the wheel. The roll is decided server-side by
 * `triggerDiceRoll`, which records an overlay event the OBS overlay animates;
 * the numeric result is announced here (dice aren't a suspenseful single
 * reveal, and the tumble is brief).
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { triggerDiceRoll } from "@/lib/overlay/tools/dice";
import type { ShuffleContext } from "./shuffle";

export async function handleDiceCommand(ctx: ShuffleContext, count: number): Promise<void> {
  const admin = createServiceClient();
  if (!(await isProUser(ctx.userId, admin))) return; // Pro-gated; stay silent for non-Pro owners.

  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const res = await triggerDiceRoll({
    ownerUserId: ctx.userId,
    sessionId: session?.id ?? null,
    count,
    triggeredBy: ctx.senderDisplayName,
    source: "chat",
  });

  const message =
    res.values.length > 1
      ? `🎲 ${ctx.senderDisplayName} rolled ${res.values.join(" + ")} = ${res.total}`
      : `🎲 ${ctx.senderDisplayName} rolled ${res.values[0]}`;
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message,
  });
}
