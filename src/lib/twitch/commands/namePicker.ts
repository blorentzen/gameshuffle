/**
 * Name Picker raffle commands: `!enter` (viewers join, viewer-level) and
 * `!draw [N]` (broadcaster + mods pick winners). Requires an active session
 * (the entrant pool is per-session). Pro-gated on the streamer.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { addEntrant, triggerDraw } from "@/lib/overlay/tools/namePicker";
import type { ShuffleContext } from "./shuffle";

async function ownerIsPro(userId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  return (
    effectiveTier({
      tier: normalizeTier(data?.subscription_tier as string | null),
      role: (data?.role as string | null) ?? null,
    }) === "pro"
  );
}

/** Viewer join. Silent no-op when there's no active session (so it never spams). */
export async function handleEnterCommand(ctx: ShuffleContext): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  if (!session) return;
  await addEntrant({
    sessionId: session.id,
    viewerTwitchUserId: ctx.senderTwitchId,
    displayName: ctx.senderDisplayName,
  });
}

/** Broadcaster/mods draw N winners (default 1). Winners reveal on the overlay. */
export async function handleDrawCommand(ctx: ShuffleContext, count: number): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  if (!session) {
    if (ctx.isBroadcaster) {
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: "🎟️ No active session to draw from. Start one from your dashboard.",
      });
    }
    return;
  }
  const { winners, entries } = await triggerDraw({
    ownerUserId: ctx.userId,
    sessionId: session.id,
    count,
    source: "chat",
  });
  const message = winners.length
    ? `🎉 ${winners.length > 1 ? "Winners" : "Winner"}: ${winners.join(", ")} (from ${entries} entries)`
    : "🎟️ No entries yet — viewers, type !enter to join!";
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message,
  });
}
