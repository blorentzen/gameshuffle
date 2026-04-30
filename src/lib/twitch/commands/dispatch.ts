/**
 * Dispatches a parsed chat command to the appropriate handler.
 *
 * Phase 2 shipped !gs-shuffle (broadcaster) + !gs / !gs-help.
 * Phase 3 added the viewer participation surface (!gs-join, !gs-leave,
 *   !gs-mycombo, !gs-lobby), the mod surface (!gs-kick, !gs-clear), and
 *   extended !gs-shuffle to active participants.
 * Phase 4 (modules) — Picks (!gs-pick / !gs-picks / !gs-pickreset) and
 *   Bans (!gs-ban / !gs-bans / !gs-banreset) routed through the module
 *   registry per gs-feature-modules-picks-bans.md.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import type { ParsedCommand } from "./parse";
import { handleShuffleCommand, type ShuffleContext } from "./shuffle";
import {
  handleJoinCommand,
  handleLeaveCommand,
  handleLobbyCommand,
  handleMyComboCommand,
} from "./participants";
import { handleClearCommand, handleKickCommand } from "./moderation";
import {
  handlePickCommand,
  handlePicksListCommand,
  handlePickResetCommand,
} from "@/lib/modules/picks";
import {
  handleBanCommand,
  handleBansListCommand,
  handleBanResetCommand,
} from "@/lib/modules/bans";
import { moduleForChatCommand } from "@/lib/modules/registry";

export interface CommandDispatchContext extends ShuffleContext {
  /** True when sender has the moderator OR broadcaster badge. */
  isModerator: boolean;
}

// Phase 4B chat-help quality pass per spec §8.2. Single message (Twitch
// 500-char cap) but visually grouped so viewers can scan in 3 seconds:
// JOIN to enter, SHUFFLE for a combo, MYCOMBO to recall it, LOBBY for
// the roster, LEAVE to drop. Mod commands trail behind "MODS:" so they
// don't crowd the viewer-facing path.
const HELP_MESSAGE_IN_SESSION =
  "🎲 GS → JOIN: !gs-join · SHUFFLE: !gs-shuffle (your combo) · MYCOMBO: !gs-mycombo · LOBBY: !gs-lobby · LEAVE: !gs-leave · MODS: !gs-kick @user [min] · !gs-clear · Picks/Bans appear when enabled.";
const HELP_MESSAGE_NO_SESSION =
  "🎲 GameShuffle isn't running a session right now. When the streamer goes live in a supported game, type !gs-join to enter the shuffle.";
const HELP_MESSAGE_QUEUE_MODE =
  "🎲 GS Queue → JOIN: !gs-join · LOBBY: !gs-lobby (see who's in line) · LEAVE: !gs-leave · MODS: !gs-kick @user [min] · !gs-clear · No combo to roll in queue mode.";

interface ActiveSessionRef {
  sessionId: string;
  randomizerSlug: string | null;
}

async function resolveActiveSession(userId: string): Promise<ActiveSessionRef | null> {
  const session = await findTwitchSessionForUser(userId, ["active", "test"]);
  if (!session) return null;
  return {
    sessionId: session.id,
    randomizerSlug: session.randomizer_slug,
  };
}

/** Build the picks/bans context once a session has been resolved. */
function buildModuleContext(
  ctx: CommandDispatchContext,
  session: ActiveSessionRef
) {
  return {
    sessionId: session.sessionId,
    broadcasterTwitchId: ctx.broadcasterTwitchId,
    botTwitchId: ctx.botTwitchId,
    senderTwitchId: ctx.senderTwitchId,
    senderLogin: ctx.senderLogin,
    isBroadcaster: ctx.isBroadcaster,
    isModerator: ctx.isModerator,
    randomizerSlug: session.randomizerSlug,
  };
}

export async function dispatchCommand(
  command: ParsedCommand,
  ctx: CommandDispatchContext
): Promise<void> {
  switch (command.name) {
    case "shuffle":
      await handleShuffleCommand(ctx);
      return;
    case "join":
      await handleJoinCommand(ctx);
      return;
    case "leave":
      await handleLeaveCommand(ctx);
      return;
    case "mycombo":
      await handleMyComboCommand(ctx);
      return;
    case "lobby":
      await handleLobbyCommand(ctx);
      return;
    case "kick":
      if (!ctx.isModerator) return;
      await handleKickCommand(ctx, command.args);
      return;
    case "clear":
      if (!ctx.isModerator) return;
      await handleClearCommand(ctx);
      return;
    case "help": {
      // Context-aware per spec §8.2: in-session shows the playable
      // commands; no-session and queue-mode each have their own
      // focused message so viewers know exactly what they can do.
      // Queue mode (no randomizer) keeps !gs-join / !gs-lobby /
      // !gs-leave as the playable surface.
      const helpSession = await resolveActiveSession(ctx.userId);
      const helpMessage = !helpSession
        ? HELP_MESSAGE_NO_SESSION
        : !helpSession.randomizerSlug
          ? HELP_MESSAGE_QUEUE_MODE
          : HELP_MESSAGE_IN_SESSION;
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: helpMessage,
      });
      return;
    }
    case "":
      // bare `!gs` — one-line info blurb, nudges to !gs-help for the full list.
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: "🎲 GameShuffle randomizes your loadout each round. Type !gs-help for commands.",
      });
      return;
  }

  // Module-routed commands. Look up the owning module from the registry;
  // if no module owns it, fall through to the silent ignore at the end.
  const owningModule = moduleForChatCommand(command.name);
  if (!owningModule) return;

  const session = await resolveActiveSession(ctx.userId);
  if (!session) {
    if (ctx.isBroadcaster) {
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: "🎲 No active session — start one from your dashboard before using module commands.",
      });
    }
    return;
  }

  const moduleCtx = buildModuleContext(ctx, session);

  if (owningModule === "picks") {
    switch (command.name) {
      case "pick":
        await handlePickCommand(moduleCtx, command.args);
        return;
      case "picks":
        await handlePicksListCommand(moduleCtx);
        return;
      case "pickreset":
        await handlePickResetCommand(moduleCtx, command.args);
        return;
    }
  }

  if (owningModule === "bans") {
    switch (command.name) {
      case "ban":
        await handleBanCommand(moduleCtx, command.args);
        return;
      case "bans":
        await handleBansListCommand(moduleCtx);
        return;
      case "banreset":
        await handleBanResetCommand(moduleCtx, command.args);
        return;
    }
  }

  // Fallthrough: kart_randomizer's chat commands (shuffle, mycombo) are
  // already routed via the explicit cases above, so we don't need a
  // generic kart_randomizer branch here.
}
