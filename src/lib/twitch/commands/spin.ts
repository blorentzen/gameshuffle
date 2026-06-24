/**
 * `!spin` (alias `!gs-spin`) — spin the streamer's default wheel.
 *
 * Broadcaster + mods only (gated by `minAuthority: "mod"` at dispatch).
 * Session-INDEPENDENT: the wheel works any time, with or without an active
 * game-night session. The winner is decided server-side via `performSpin`
 * and recorded to the spin log, which the overlay polls + animates.
 *
 * We deliberately do NOT announce the winner here — that would spoil the
 * result before the wheel lands on stream. The overlay calls
 * `/api/twitch/overlay/[token]/announce-spin` when the animation finishes,
 * which posts the winner to chat (once, race-safe via `announced_at`).
 *
 * Reuses `ShuffleContext` (same fields `asShuffleCtx` already provides).
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, hasCapability, normalizeTier } from "@/lib/subscription";
import { performSpin } from "@/lib/wheels/spin";
import type { ShuffleContext } from "./shuffle";
import { wheelNoSetupMessage } from "./messages";

export async function handleSpinCommand(ctx: ShuffleContext): Promise<void> {
  // Pro gate — wheels are Pro-only. Stay silent for non-Pro owners so we
  // never spam chat (and only Pro streamers can configure wheels anyway).
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", ctx.userId)
    .maybeSingle();
  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  };
  if (effectiveTier(capUser) !== "pro" || !hasCapability(capUser, "wheels.use")) {
    return;
  }

  const outcome = await performSpin({
    ownerUserId: ctx.userId,
    triggeredBy: ctx.senderDisplayName,
    triggerType: "chat_command",
  });

  if (!outcome.ok) {
    // Only nudge the broadcaster — a mis-typed !spin shouldn't spam chat.
    if (ctx.isBroadcaster) {
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: wheelNoSetupMessage(outcome.error),
      });
    }
    return;
  }

  // Winner announcement is deferred to the overlay animation-end callback
  // (see announce-spin route) so chat doesn't spoil the in-stream result.
}
