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
import { getSessionModule } from "@/lib/modules/store";
import {
  handleBanItemCommand,
  handleBanTrackCommand,
  handleClearItemBansCommand,
  handleClearTrackBansCommand,
  handleItemsCommand,
  handlePickItemCommand,
  handlePickTrackCommand,
  handleRaceCommand,
  handleTrackCommand,
  type RaceCommandContext,
} from "./race";

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
const HELP_MESSAGE_IN_SESSION_WITH_RACE =
  "🎲 GS → JOIN: !gs-join · SHUFFLE: !gs-shuffle · MYCOMBO: !gs-mycombo · LOBBY: !gs-lobby · LEAVE: !gs-leave · STREAMER: !gs-track / !gs-items / !gs-race [N] · MODS: !gs-kick @user [min] · !gs-clear";
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
      // Context-aware per spec §8.2 + Phase A §5.2 update: in-session
      // shows the playable commands; queue mode shows the queue-only
      // surface; in-session sessions where race_randomizer is enabled
      // show the race-extended set so streamers find !gs-track / etc.
      const helpSession = await resolveActiveSession(ctx.userId);
      let helpMessage: string;
      if (!helpSession) {
        helpMessage = HELP_MESSAGE_NO_SESSION;
      } else if (!helpSession.randomizerSlug) {
        helpMessage = HELP_MESSAGE_QUEUE_MODE;
      } else {
        const raceModule = await getSessionModule({
          sessionId: helpSession.sessionId,
          moduleId: "race_randomizer",
          includeDisabled: false,
        }).catch(() => null);
        helpMessage = raceModule?.enabled
          ? HELP_MESSAGE_IN_SESSION_WITH_RACE
          : HELP_MESSAGE_IN_SESSION;
      }
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

  // Race randomizer (Phase A) — broadcaster-only per spec §5.1. Mods +
  // viewers get silently ignored so chat doesn't fill up with rejections.
  if (owningModule === "race_randomizer") {
    if (!ctx.isBroadcaster) return;
    const raceCtx: RaceCommandContext = {
      userId: ctx.userId,
      broadcasterTwitchId: ctx.broadcasterTwitchId,
      senderTwitchId: ctx.senderTwitchId,
      senderDisplayName: ctx.senderDisplayName,
      botTwitchId: ctx.botTwitchId,
    };
    switch (command.name) {
      case "track":
        await handleTrackCommand(raceCtx);
        return;
      case "items":
        await handleItemsCommand(raceCtx);
        return;
      case "race":
        await handleRaceCommand(raceCtx, command.args);
        return;
      case "pick-track":
        await handlePickTrackCommand(raceCtx, command.args);
        return;
      case "ban-track":
        await handleBanTrackCommand(raceCtx, command.args);
        return;
      case "pick-item":
        await handlePickItemCommand(raceCtx, command.args);
        return;
      case "ban-item":
        await handleBanItemCommand(raceCtx, command.args);
        return;
      case "clear-track-bans":
        await handleClearTrackBansCommand(raceCtx);
        return;
      case "clear-item-bans":
        await handleClearItemBansCommand(raceCtx);
        return;
    }
  }

  // Fallthrough: kart_randomizer's chat commands (shuffle, mycombo) are
  // already routed via the explicit cases above, so we don't need a
  // generic kart_randomizer branch here.
}
