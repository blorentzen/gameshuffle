/**
 * `!gs-shuffle` — shuffle behavior:
 *   - Broadcaster: shuffles the broadcaster's combo, no cooldown, posts to
 *     chat (Phase 5 will also push to overlay). Always allowed regardless
 *     of participant state.
 *   - Active participant: shuffles their personal combo (stored on the
 *     participant row for !gs-mycombo). Subject to a per-user cooldown.
 *   - Anyone else: silently ignored — typing !gs-shuffle without joining
 *     shouldn't spam chat with "join first" rejections.
 */

import { randomizeKartCombo } from "@/lib/randomizer";
import { sendChatMessage } from "@/lib/twitch/client";
import { getTwitchGame } from "@/lib/twitch/games";
import {
  findTwitchSessionForUser,
  findTwitchParticipant,
  patchTwitchParticipantById,
  recordTwitchShuffleEvent,
} from "@/lib/sessions/twitch-bridge";
import {
  formatCombo,
  gameNotSupportedMessage,
  notInShuffleMessage,
  shuffleCooldownMessage,
  shuffleResultMessage,
} from "./messages";

export const DEFAULT_SHUFFLE_COOLDOWN_SECONDS = 30;

export interface ShuffleContext {
  /** The GameShuffle user_id that owns this Twitch connection (broadcaster). */
  userId: string;
  /** The broadcaster's Twitch user ID (used for Helix calls). */
  broadcasterTwitchId: string;
  /** The sender's Twitch user ID. */
  senderTwitchId: string;
  /** The sender's Twitch login (lowercase). */
  senderLogin: string;
  /** The sender's display name (used in chat reply). */
  senderDisplayName: string;
  /** True when the sender is the broadcaster (has broadcaster badge). */
  isBroadcaster: boolean;
  /** Bot's Twitch user ID, used as sender on outgoing chat. */
  botTwitchId: string;
  /** Streamer's persistent overlay token (also used for /lobby/[token] URL). */
  overlayToken: string | null;
}

export async function handleShuffleCommand(ctx: ShuffleContext): Promise<void> {
  const activeSession = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);

  if (!activeSession) {
    if (ctx.isBroadcaster) {
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: "🎲 No active shuffle session. Go live in a supported game (or start a test session from your dashboard).",
      });
    }
    return;
  }

  const game = getTwitchGame(activeSession.randomizer_slug);
  if (!game) {
    // Session exists but the streamer is on an unsupported (or no)
    // Twitch category. Tell anyone who pings the bot — silence here is
    // confusing, especially since !gs-help suggests this command works.
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: gameNotSupportedMessage(),
    });
    return;
  }

  // Always check for a participant row — broadcasters often join their own
  // shuffle and expect !gs-mycombo to work afterward. The broadcaster vs.
  // viewer distinction only changes the gating below, not whether we save
  // the result.
  const participant = await findTwitchParticipant({
    sessionId: activeSession.id,
    twitchUserId: ctx.senderTwitchId,
  });

  if (!ctx.isBroadcaster) {
    if (!participant || participant.left_at) {
      // Tell them why nothing happened so they know they need to join.
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: notInShuffleMessage(ctx.senderDisplayName),
      });
      return;
    }
    if (participant.current_combo_at) {
      const lastMs = Date.parse(participant.current_combo_at);
      const elapsed = (Date.now() - lastMs) / 1000;
      const remaining = Math.ceil(DEFAULT_SHUFFLE_COOLDOWN_SECONDS - elapsed);
      if (remaining > 0) {
        await sendChatMessage({
          broadcasterId: ctx.broadcasterTwitchId,
          senderId: ctx.botTwitchId,
          message: shuffleCooldownMessage(ctx.senderDisplayName, remaining),
        });
        return;
      }
    }
  }

  const combo = randomizeKartCombo(game.data, [], [], []);

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: shuffleResultMessage(ctx.senderDisplayName, formatCombo(combo, game)),
  });

  // Persist the combo on the participant row whenever one exists, so
  // !gs-mycombo can recall it later. Broadcaster who hasn't joined yet
  // simply skips this — their shuffle still posts to chat.
  if (participant && !participant.left_at) {
    await patchTwitchParticipantById(participant.id, {
      current_combo: combo as unknown as Record<string, unknown>,
      current_combo_at: new Date().toISOString(),
    });
  }

  // Audit log — drives the dashboard recent feed and (Phase 5) the overlay.
  await recordTwitchShuffleEvent({
    sessionId: activeSession.id,
    twitchUserId: ctx.senderTwitchId,
    twitchDisplayName: ctx.senderDisplayName,
    triggerType: "chat_command",
    combo: combo as unknown as Record<string, unknown>,
    isBroadcaster: ctx.isBroadcaster,
  });
}
