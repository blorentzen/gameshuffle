/**
 * `!gs-shuffle` — Phase 2 scope: broadcaster-only. Runs the randomizer for
 * the active session's game and posts the combo to chat.
 *
 * Later phases extend this to viewer shuffles (session participants) and
 * cooldowns. For now, non-broadcaster senders are silently ignored so we
 * don't spam chat while the rest of the command surface isn't live yet.
 */

import { randomizeKartCombo } from "@/lib/randomizer";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { getTwitchGame } from "@/lib/twitch/games";
import type { KartCombo } from "@/data/types";

export interface ShuffleContext {
  /** The GameShuffle user_id that owns this Twitch connection (broadcaster). */
  userId: string;
  /** The broadcaster's Twitch user ID (used for Helix calls). */
  broadcasterTwitchId: string;
  /** The sender's Twitch user ID. */
  senderTwitchId: string;
  /** The sender's display name (used in chat reply). */
  senderDisplayName: string;
  /** True when the sender is the broadcaster (has broadcaster badge). */
  isBroadcaster: boolean;
  /** Bot's Twitch user ID, used as sender on outgoing chat. */
  botTwitchId: string;
}

export async function handleShuffleCommand(ctx: ShuffleContext): Promise<void> {
  // Phase 2: only broadcaster can trigger a shuffle.
  if (!ctx.isBroadcaster) return;

  const admin = createTwitchAdminClient();
  const { data: activeSession } = await admin
    .from("twitch_sessions")
    .select("id, randomizer_slug")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "test"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeSession) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: "🎲 No active shuffle session. Go live in a supported game (or start a test session from your dashboard).",
    });
    return;
  }

  const game = getTwitchGame(activeSession.randomizer_slug as string);
  if (!game) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: "🎲 This game isn't supported by GameShuffle yet.",
    });
    return;
  }

  const combo = randomizeKartCombo(game.data, [], [], []);
  const message = formatShuffleMessage(ctx.senderDisplayName, combo, game);

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message,
  });

  // Record the shuffle event so the overlay (Phase 5) can read it later.
  await admin.from("twitch_shuffle_events").insert({
    session_id: activeSession.id,
    twitch_user_id: ctx.senderTwitchId,
    twitch_display_name: ctx.senderDisplayName,
    trigger_type: "chat_command",
    combo: combo as unknown as Record<string, unknown>,
    is_broadcaster: ctx.isBroadcaster,
  });
}

function formatShuffleMessage(
  displayName: string,
  combo: KartCombo,
  game: { hasWheels: boolean; hasGlider: boolean }
): string {
  const parts = [combo.character.name, combo.vehicle.name];
  if (game.hasWheels) parts.push(combo.wheels.name);
  if (game.hasGlider) parts.push(combo.glider.name);
  return `🎲 @${displayName} drew: ${parts.join(" · ")}`;
}
