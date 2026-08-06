/**
 * `!gs-flip` — flip a coin on the streamer's overlay. Broadcaster + mods only
 * (dispatch), Pro-gated in the handler. Session-independent. Mirrors the dice
 * command; the coin lands on the overlay and the result is announced in chat.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { triggerCoinFlip } from "@/lib/overlay/tools/coin";
import type { ShuffleContext } from "./shuffle";

export async function handleCoinCommand(ctx: ShuffleContext): Promise<void> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", ctx.userId)
    .maybeSingle();
  const tier = effectiveTier({
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  });
  if (tier !== "pro") return;

  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const res = await triggerCoinFlip({
    ownerUserId: ctx.userId,
    sessionId: session?.id ?? null,
    triggeredBy: ctx.senderDisplayName,
    source: "chat",
  });

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: `🪙 ${ctx.senderDisplayName} flipped ${res.result === "heads" ? "Heads" : "Tails"}`,
  });
}
