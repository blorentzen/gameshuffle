/**
 * Viewer participation commands: !gs-join, !gs-leave, !gs-mycombo, !gs-lobby.
 *
 * Lobby state lives in `twitch_session_participants` keyed by (session_id,
 * twitch_user_id). A row with `left_at IS NULL` is "currently in the
 * shuffle." Rejoin cooldown is recorded as `rejoin_eligible_at` on the
 * left row so we can return a friendly countdown on a too-quick rejoin.
 *
 * Per-streamer config (cooldowns, access levels, lobby cap overrides) is
 * out of scope for the v1 of this phase — defaults are hardcoded in
 * DEFAULT_REJOIN_COOLDOWN_SECONDS and the per-game `lobbyCap` from the
 * games registry.
 */

import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { getTwitchGame } from "@/lib/twitch/games";
import {
  alreadyInShuffleMessage,
  joinMessage,
  leaveMessage,
  lobbyFullMessage,
  lobbyMessage,
  myComboMessage,
  noComboYetMessage,
  notInShuffleMessage,
  rejoinCooldownMessage,
  userIsKickedMessage,
  formatCombo,
} from "./messages";
import type { KartCombo } from "@/data/types";

export const DEFAULT_REJOIN_COOLDOWN_SECONDS = 60;
const LOBBY_LIST_LIMIT = 10;

interface ParticipantContext {
  userId: string;
  broadcasterTwitchId: string;
  senderTwitchId: string;
  senderLogin: string;
  senderDisplayName: string;
  botTwitchId: string;
}

interface ActiveSession {
  id: string;
  randomizer_slug: string;
}

async function getActiveSession(userId: string): Promise<ActiveSession | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_sessions")
    .select("id, randomizer_slug")
    .eq("user_id", userId)
    .in("status", ["active", "test"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveSession | null) ?? null;
}

interface ParticipantRow {
  id: string;
  session_id: string;
  twitch_user_id: string;
  twitch_login: string;
  twitch_display_name: string;
  joined_at: string;
  left_at: string | null;
  left_reason: string | null;
  current_combo: KartCombo | null;
  current_combo_at: string | null;
  kick_until: string | null;
  rejoin_eligible_at: string | null;
}

async function getParticipant(
  sessionId: string,
  twitchUserId: string
): Promise<ParticipantRow | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_session_participants")
    .select(
      "id, session_id, twitch_user_id, twitch_login, twitch_display_name, joined_at, left_at, left_reason, current_combo, current_combo_at, kick_until, rejoin_eligible_at"
    )
    .eq("session_id", sessionId)
    .eq("twitch_user_id", twitchUserId)
    .maybeSingle();
  return (data as ParticipantRow | null) ?? null;
}

async function activeParticipantCount(sessionId: string): Promise<number> {
  const admin = createTwitchAdminClient();
  const { count } = await admin
    .from("twitch_session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .is("left_at", null);
  return count ?? 0;
}

export async function handleJoinCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return; // No active session — silently ignore. Avoids spam in unrelated chat.

  const game = getTwitchGame(session.randomizer_slug);
  const cap = game?.lobbyCap ?? 12;
  const admin = createTwitchAdminClient();

  const existing = await getParticipant(session.id, ctx.senderTwitchId);

  // Active kick still in effect → friendly countdown.
  if (existing?.kick_until) {
    const kickUntilMs = Date.parse(existing.kick_until);
    if (Number.isFinite(kickUntilMs) && kickUntilMs > Date.now()) {
      const remaining = Math.ceil((kickUntilMs - Date.now()) / 1000);
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: userIsKickedMessage(ctx.senderDisplayName, remaining),
      });
      return;
    }
  }

  // Already in the shuffle (active row) → no-op reply.
  if (existing && !existing.left_at) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: alreadyInShuffleMessage(ctx.senderDisplayName),
    });
    return;
  }

  // Voluntary-leave rejoin cooldown still active → friendly countdown.
  if (existing?.rejoin_eligible_at) {
    const eligibleMs = Date.parse(existing.rejoin_eligible_at);
    if (Number.isFinite(eligibleMs) && eligibleMs > Date.now()) {
      const remaining = Math.ceil((eligibleMs - Date.now()) / 1000);
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: rejoinCooldownMessage(ctx.senderDisplayName, remaining),
      });
      return;
    }
  }

  // Capacity check
  const currentCount = await activeParticipantCount(session.id);
  if (currentCount >= cap) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: lobbyFullMessage(),
    });
    return;
  }

  if (existing) {
    // Returning participant — clear the left/kick/cooldown markers
    await admin
      .from("twitch_session_participants")
      .update({
        left_at: null,
        left_reason: null,
        rejoin_eligible_at: null,
        kick_until: null,
        joined_at: new Date().toISOString(),
        twitch_login: ctx.senderLogin,
        twitch_display_name: ctx.senderDisplayName,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("twitch_session_participants").insert({
      session_id: session.id,
      twitch_user_id: ctx.senderTwitchId,
      twitch_login: ctx.senderLogin,
      twitch_display_name: ctx.senderDisplayName,
    });
  }

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: joinMessage(ctx.senderDisplayName, currentCount + 1, cap),
  });
}

export async function handleLeaveCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return;

  const existing = await getParticipant(session.id, ctx.senderTwitchId);
  if (!existing || existing.left_at) {
    // Not in the shuffle → silent ignore (avoids "type !gs-join first" being
    // sent every time someone misclicks; spec only mentions the inverse case).
    return;
  }

  const admin = createTwitchAdminClient();
  const eligibleAt = new Date(Date.now() + DEFAULT_REJOIN_COOLDOWN_SECONDS * 1000).toISOString();
  await admin
    .from("twitch_session_participants")
    .update({
      left_at: new Date().toISOString(),
      left_reason: "voluntary",
      rejoin_eligible_at: eligibleAt,
    })
    .eq("id", existing.id);

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: leaveMessage(ctx.senderDisplayName),
  });
}

export async function handleMyComboCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return;

  const game = getTwitchGame(session.randomizer_slug);
  if (!game) return;

  const participant = await getParticipant(session.id, ctx.senderTwitchId);
  if (!participant || participant.left_at) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: notInShuffleMessage(ctx.senderDisplayName),
    });
    return;
  }
  if (!participant.current_combo) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: noComboYetMessage(ctx.senderDisplayName),
    });
    return;
  }

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: myComboMessage(ctx.senderDisplayName, formatCombo(participant.current_combo, game)),
  });
}

export async function handleLobbyCommand(ctx: ParticipantContext): Promise<void> {
  const session = await getActiveSession(ctx.userId);
  if (!session) return;

  const game = getTwitchGame(session.randomizer_slug);
  const cap = game?.lobbyCap ?? 12;

  const admin = createTwitchAdminClient();
  const { data: rows } = await admin
    .from("twitch_session_participants")
    .select("twitch_display_name, joined_at")
    .eq("session_id", session.id)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  const all = (rows as { twitch_display_name: string }[] | null) ?? [];
  const count = all.length;
  const displayedNames = all.slice(0, LOBBY_LIST_LIMIT).map((r) => r.twitch_display_name);
  const overflow = Math.max(0, count - LOBBY_LIST_LIMIT);

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: lobbyMessage({ count, cap, displayedNames, overflow }),
  });
}

export type { ParticipantContext };
