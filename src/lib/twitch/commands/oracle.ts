/**
 * Oracle chat commands (Streamer Tools Integration): `!gs-8ball <q>`,
 * `!gs-decide <q>`, `!gs-truth`, `!gs-dare`. Viewer-facing (the whole point is
 * chat participation), throttled by the command cooldown; Pro-gated on the
 * streamer. Each shows an answer card on the overlay + announces in chat.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import {
  triggerEightBall,
  triggerYesNo,
  triggerTruthOrDare,
} from "@/lib/overlay/tools/oracle";
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

export async function handleEightBallCommand(ctx: ShuffleContext, question: string): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const { answer } = await triggerEightBall({
    ownerUserId: ctx.userId,
    sessionId: session?.id ?? null,
    question,
    triggeredBy: ctx.senderDisplayName,
    source: "chat",
  });
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: `🎱 ${answer}`,
  });
}

export async function handleDecideCommand(ctx: ShuffleContext, question: string): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const { answer } = await triggerYesNo({
    ownerUserId: ctx.userId,
    sessionId: session?.id ?? null,
    question,
    triggeredBy: ctx.senderDisplayName,
    source: "chat",
  });
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: `❓ ${answer}`,
  });
}

export async function handleTruthDareCommand(
  ctx: ShuffleContext,
  which: "truth" | "dare",
): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const { answer } = await triggerTruthOrDare({
    ownerUserId: ctx.userId,
    sessionId: session?.id ?? null,
    which,
    triggeredBy: ctx.senderDisplayName,
    source: "chat",
  });
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: which === "dare" ? `🔥 Dare: ${answer}` : `🗣️ Truth: ${answer}`,
  });
}
