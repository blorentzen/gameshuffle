/**
 * Viewer participation commands: !gs-join, !gs-leave, !gs-mycombo, !gs-lobby.
 *
 * Lobby state lives in `session_participants` keyed by (session_id,
 * platform='twitch', platform_user_id). A row with `left_at IS NULL` is
 * "currently in the shuffle." Rejoin cooldown is recorded as
 * `rejoin_eligible_at` on the left row so we can return a friendly
 * countdown on a too-quick rejoin.
 *
 * Per-streamer config (cooldowns, access levels, lobby cap overrides) is
 * out of scope for this phase — defaults are hardcoded in
 * DEFAULT_REJOIN_COOLDOWN_SECONDS and the per-game `lobbyCap` from the
 * games registry.
 */

import { getTwitchGame, resolveLobbyCap } from "@/lib/twitch/games";
import {
  countActiveTwitchParticipants,
  findTwitchParticipant,
  findTwitchSessionForUser,
  insertTwitchParticipant,
  listActiveTwitchParticipants,
  patchTwitchParticipantById,
} from "@/lib/sessions/twitch-platform";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import {
  alreadyInShuffleMessage,
  broadcasterAlwaysInMessage,
  formatStoredCombo,
  joinMessage,
  leaveMessage,
  lobbyFullMessage,
  lobbyMessage,
  myComboMessage,
  noComboYetMessage,
  notInShuffleMessage,
  queueModeNoComboMessage,
  rejoinCooldownMessage,
  userIsKickedMessage,
} from "./messages";
import type { KartCombo } from "@/data/types";

export const DEFAULT_REJOIN_COOLDOWN_SECONDS = 60;
const LOBBY_LIST_LIMIT = 10;

/**
 * Insert (or revive) a participant row for the broadcaster on a given
 * session, so the streamer is always in the lobby without having to
 * type !gs-join. Called from session-creation paths (stream.online,
 * test-session start) and after the lobby is cleared on a category
 * change. Resets combo + state so the row is a clean slate.
 */
export async function ensureBroadcasterInSession(args: {
  sessionId: string;
  twitchUserId: string;
  twitchLogin: string;
  twitchDisplayName: string;
}): Promise<void> {
  const existing = await findTwitchParticipant({
    sessionId: args.sessionId,
    twitchUserId: args.twitchUserId,
  });

  if (existing) {
    await patchTwitchParticipantById(existing.id, {
      left_at: null,
      left_reason: null,
      kick_until: null,
      rejoin_eligible_at: null,
      current_combo: null,
      current_combo_at: null,
      twitch_login: args.twitchLogin,
      twitch_display_name: args.twitchDisplayName,
    });
  } else {
    await insertTwitchParticipant({
      sessionId: args.sessionId,
      twitchUserId: args.twitchUserId,
      twitchLogin: args.twitchLogin,
      twitchDisplayName: args.twitchDisplayName,
      isBroadcaster: true,
    });
  }
}

interface ParticipantContext {
  userId: string;
  broadcasterTwitchId: string;
  senderTwitchId: string;
  senderLogin: string;
  senderDisplayName: string;
  /** True when the sender holds the broadcaster badge (or is the broadcaster). */
  isBroadcaster: boolean;
  botTwitchId: string;
  /** Streamer's persistent overlay token (powers the /lobby/[token] URL). */
  overlayToken: string | null;
}

interface ActiveSession {
  id: string;
  randomizer_slug: string | null;
  /** Streamer-set cap; only consulted when no randomizer is bound (queue mode). */
  max_participants: number | null;
}

async function getActiveSession(userId: string): Promise<ActiveSession | null> {
  const session = await findTwitchSessionForUser(userId, ["active", "test"]);
  if (!session) return null;
  return {
    id: session.id,
    randomizer_slug: session.randomizer_slug,
    max_participants: session.max_participants,
  };
}

function adapterFor(ctx: ParticipantContext, session: ActiveSession): TwitchAdapter {
  return new TwitchAdapter({ sessionId: session.id, ownerUserId: ctx.userId });
}

export async function handleJoinCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return; // No active session — silently ignore. Avoids spam in unrelated chat.
  const adapter = adapterFor(ctx, session);

  const game = getTwitchGame(session.randomizer_slug);
  const cap = resolveLobbyCap(game, session.max_participants);

  const existing = await findTwitchParticipant({
    sessionId: session.id,
    twitchUserId: ctx.senderTwitchId,
  });

  // Active kick still in effect → friendly countdown.
  if (existing?.kick_until) {
    const kickUntilMs = Date.parse(existing.kick_until);
    if (Number.isFinite(kickUntilMs) && kickUntilMs > Date.now()) {
      const remaining = Math.ceil((kickUntilMs - Date.now()) / 1000);
      await adapter.postChatMessage(userIsKickedMessage(ctx.senderDisplayName, remaining));
      return;
    }
  }

  // Already in the shuffle (active row) → no-op reply.
  if (existing && !existing.left_at) {
    await adapter.postChatMessage(alreadyInShuffleMessage(ctx.senderDisplayName));
    return;
  }

  // Voluntary-leave rejoin cooldown still active → friendly countdown.
  if (existing?.rejoin_eligible_at) {
    const eligibleMs = Date.parse(existing.rejoin_eligible_at);
    if (Number.isFinite(eligibleMs) && eligibleMs > Date.now()) {
      const remaining = Math.ceil((eligibleMs - Date.now()) / 1000);
      await adapter.postChatMessage(rejoinCooldownMessage(ctx.senderDisplayName, remaining));
      return;
    }
  }

  // Capacity check
  const currentCount = await countActiveTwitchParticipants(session.id);
  if (currentCount >= cap) {
    await adapter.postChatMessage(lobbyFullMessage());
    return;
  }

  if (existing) {
    // Returning participant — clear the left/kick/cooldown markers
    await patchTwitchParticipantById(existing.id, {
      left_at: null,
      left_reason: null,
      rejoin_eligible_at: null,
      kick_until: null,
      twitch_login: ctx.senderLogin,
      twitch_display_name: ctx.senderDisplayName,
    });
  } else {
    await insertTwitchParticipant({
      sessionId: session.id,
      twitchUserId: ctx.senderTwitchId,
      twitchLogin: ctx.senderLogin,
      twitchDisplayName: ctx.senderDisplayName,
    });
  }

  await adapter.postChatMessage(joinMessage(ctx.senderDisplayName, currentCount + 1, cap));
}

export async function handleLeaveCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return;
  const adapter = adapterFor(ctx, session);

  // Broadcaster can't leave — they're permanently in the shuffle so the
  // lobby is never empty from a viewer's perspective.
  if (ctx.isBroadcaster) {
    await adapter.postChatMessage(broadcasterAlwaysInMessage(ctx.senderDisplayName));
    return;
  }

  const existing = await findTwitchParticipant({
    sessionId: session.id,
    twitchUserId: ctx.senderTwitchId,
  });
  if (!existing || existing.left_at) {
    await adapter.postChatMessage(notInShuffleMessage(ctx.senderDisplayName));
    return;
  }

  const eligibleAt = new Date(Date.now() + DEFAULT_REJOIN_COOLDOWN_SECONDS * 1000).toISOString();
  await patchTwitchParticipantById(existing.id, {
    left_at: new Date().toISOString(),
    left_reason: "voluntary",
    rejoin_eligible_at: eligibleAt,
  });

  await adapter.postChatMessage(leaveMessage(ctx.senderDisplayName));
}

export async function handleMyComboCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return;
  const adapter = adapterFor(ctx, session);

  const participant = await findTwitchParticipant({
    sessionId: session.id,
    twitchUserId: ctx.senderTwitchId,
  });
  if (!participant || participant.left_at) {
    await adapter.postChatMessage(notInShuffleMessage(ctx.senderDisplayName));
    return;
  }
  // Queue-mode sessions have no randomizer, so there's no combo to
  // recall. Acknowledge the user is in the lobby and direct them to
  // the queue view.
  if (!getTwitchGame(session.randomizer_slug)) {
    await adapter.postChatMessage(queueModeNoComboMessage(ctx.senderDisplayName));
    return;
  }
  if (!participant.current_combo) {
    await adapter.postChatMessage(noComboYetMessage(ctx.senderDisplayName));
    return;
  }

  // Format from stored combo data — works even if the streamer changed
  // categories since the combo was rolled (the names stored in the row
  // are still the right answer for what the viewer was assigned).
  await adapter.postChatMessage(
    myComboMessage(
      ctx.senderDisplayName,
      formatStoredCombo(participant.current_combo as unknown as KartCombo)
    )
  );
}

export async function handleLobbyCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return;
  const adapter = adapterFor(ctx, session);

  const game = getTwitchGame(session.randomizer_slug);
  const cap = resolveLobbyCap(game, session.max_participants);

  const all = await listActiveTwitchParticipants(session.id);
  const count = all.length;
  const displayedNames = all.slice(0, LOBBY_LIST_LIMIT).map((r) => r.twitch_display_name);
  const overflow = Math.max(0, count - LOBBY_LIST_LIMIT);

  let fullListUrl: string | null = null;
  if (overflow > 0 && ctx.overlayToken) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.gameshuffle.co";
    fullListUrl = `${base}/lobby/${ctx.overlayToken}`;
  }

  await adapter.postChatMessage(
    lobbyMessage({ count, cap, displayedNames, overflow, fullListUrl })
  );
}

export type { ParticipantContext };
