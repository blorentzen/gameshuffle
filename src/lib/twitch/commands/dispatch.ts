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
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-bridge";
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

// Keep this string terse — it's a single chat message (500 char cap) and
// gets read live on stream. Each command gets a 1-3 word descriptor so
// viewers can skim. Mod commands grouped at the end behind "(mods)".
// Update as new commands land.
const HELP_MESSAGE =
  "🎲 GameShuffle commands → !gs-join · !gs-shuffle (random combo) · !gs-mycombo · !gs-lobby · !gs-leave · !gs-pick / !gs-ban (when enabled) · !gs-kick @user [min] / !gs-clear (mods)";

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
    case "help":
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: HELP_MESSAGE,
      });
      return;
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
