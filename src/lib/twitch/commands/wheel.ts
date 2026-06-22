/**
 * `!wheel add/remove/list/clear` — viewer contributions to the streamer's
 * default wheel.
 *
 * Access is gated by the wheel's `contribution_mode`:
 *   - off       → viewers can't add (silent)
 *   - everyone  → any viewer (cooldown-gated at dispatch)
 *   - allowlist → only vetted Twitch logins
 * Broadcaster + mods always bypass the mode. Total cap (≤5) and a
 * per-viewer limit are enforced on add. The whole feature is Pro-gated.
 *
 * Reuses `ShuffleContext` (carries owner `userId`, `senderLogin`,
 * `senderDisplayName`, `isBroadcaster`, `isModerator`).
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, hasCapability, normalizeTier } from "@/lib/subscription";
import {
  addEntry,
  clearEntries,
  getDefaultWheel,
  listEntries,
  removeEntry,
} from "@/lib/wheels/store";
import type { Wheel } from "@/lib/wheels/types";
import type { ShuffleContext } from "./shuffle";
import {
  wheelAddedMessage,
  wheelAddUsageMessage,
  wheelClearedMessage,
  wheelDuplicateMessage,
  wheelFullMessage,
  wheelListMessage,
  wheelNoSetupMessage,
  wheelPerViewerLimitMessage,
  wheelRemoveMissMessage,
  wheelRemoveUsageMessage,
  wheelRemovedMessage,
} from "./messages";

const MAX_LABEL = 80;

async function ownerIsPro(userId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  };
  return effectiveTier(capUser) === "pro" && hasCapability(capUser, "wheels.use");
}

function reply(ctx: ShuffleContext, message: string): Promise<unknown> {
  return sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message,
  });
}

/** Load the contributions target (the streamer's default wheel). */
async function loadWheel(ctx: ShuffleContext): Promise<Wheel | null> {
  return getDefaultWheel(ctx.userId);
}

export async function handleWheelAdd(ctx: ShuffleContext, args: string): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const wheel = await loadWheel(ctx);
  if (!wheel) {
    if (ctx.isBroadcaster) await reply(ctx, wheelNoSetupMessage("no_wheel"));
    return;
  }

  const privileged = ctx.isBroadcaster || ctx.isModerator;
  const { mode, max, perViewerLimit, allowlist } = wheel.contribution;

  // Mode gate — stay silent for disallowed viewers (no chat spam).
  if (!privileged) {
    if (mode === "off") return;
    if (mode === "allowlist" && !allowlist.includes(ctx.senderLogin)) return;
  }

  const label = args.trim().slice(0, MAX_LABEL);
  if (!label) {
    await reply(ctx, wheelAddUsageMessage());
    return;
  }

  const entries = await listEntries(wheel.id);
  const lower = label.toLowerCase();
  const dup =
    wheel.segments.some((s) => s.label.toLowerCase() === lower) ||
    entries.some((e) => e.label.toLowerCase() === lower);
  if (dup) {
    await reply(ctx, wheelDuplicateMessage(ctx.senderDisplayName, label));
    return;
  }

  const cap = Math.min(max, 5);
  if (entries.length >= cap) {
    await reply(ctx, wheelFullMessage());
    return;
  }
  if (!privileged) {
    const mine = entries.filter((e) => e.addedByTwitch === ctx.senderLogin).length;
    if (mine >= perViewerLimit) {
      await reply(ctx, wheelPerViewerLimitMessage(ctx.senderDisplayName));
      return;
    }
  }

  await addEntry({
    ownerUserId: ctx.userId,
    wheelId: wheel.id,
    label,
    addedByTwitch: ctx.senderLogin,
    addedByDisplay: ctx.senderDisplayName,
  });
  await reply(ctx, wheelAddedMessage(ctx.senderDisplayName, label, entries.length + 1, cap));
}

export async function handleWheelRemove(ctx: ShuffleContext, args: string): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const wheel = await loadWheel(ctx);
  if (!wheel) return;

  const label = args.trim();
  if (!label) {
    await reply(ctx, wheelRemoveUsageMessage());
    return;
  }

  // Viewers may only remove their own entry; mods/broadcaster remove any.
  const privileged = ctx.isBroadcaster || ctx.isModerator;
  const removed = await removeEntry({
    wheelId: wheel.id,
    label,
    byLogin: privileged ? undefined : ctx.senderLogin,
  });
  await reply(
    ctx,
    removed
      ? wheelRemovedMessage(ctx.senderDisplayName, label)
      : wheelRemoveMissMessage(ctx.senderDisplayName),
  );
}

export async function handleWheelList(ctx: ShuffleContext): Promise<void> {
  if (!(await ownerIsPro(ctx.userId))) return;
  const wheel = await loadWheel(ctx);
  if (!wheel) return;
  const entries = await listEntries(wheel.id);
  await reply(ctx, wheelListMessage(entries.map((e) => e.label)));
}

export async function handleWheelClear(ctx: ShuffleContext): Promise<void> {
  // minAuthority "mod" is enforced at dispatch; still Pro-gate the owner.
  if (!(await ownerIsPro(ctx.userId))) return;
  const wheel = await loadWheel(ctx);
  if (!wheel) return;
  await clearEntries(wheel.id);
  await reply(ctx, wheelClearedMessage());
}
