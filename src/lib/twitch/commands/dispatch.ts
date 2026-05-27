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
  handleItemsCommand,
  handleRaceCommand,
  handleRallyCommand,
  handleTrackCommand,
  type RaceCommandContext,
} from "./race";
import {
  handlePicksOpenCommand,
  handlePicksCloseCommand,
} from "./picksBans";
import { liveLinkMessage } from "./messages";
import { getLiveUrlForUser } from "@/lib/twitch/streamerSlug";

export interface CommandDispatchContext extends ShuffleContext {
  /** True when sender has the moderator OR broadcaster badge. */
  isModerator: boolean;
}

// Phase 4B chat-help quality pass per spec §8.2. Single message (Twitch
// 500-char cap) but audience-targeted: each requester gets only the
// sections relevant to their role. Composed at dispatch time from the
// fragments below so a viewer sees just `viewer`, a mod sees
// `viewer + mod`, and the broadcaster sees `viewer + streamer + mod`
// (when the race module is enabled).
//
// Why split: the previous all-in-one message reads dense for the 99%
// of chatters who only care about the viewer surface. Per-audience
// composition keeps the message short AND scoped to what the requester
// can actually run.

const HELP_PREFIX = "🎲 GS →";

/** Personal commands every chatter can run during an active session.
 *  Keeps the "(your combo)" hint on !gs-shuffle so cold readers
 *  understand it rolls *their* loadout, not a track/items roll. */
const HELP_VIEWER_LINE =
  "JOIN: !gs-join · SHUFFLE: !gs-shuffle (your combo) · MYCOMBO: !gs-mycombo · LOBBY: !gs-lobby · LEAVE: !gs-leave · LIVE PAGE: !gs-live";

/** Queue-mode viewer commands — !gs-shuffle / !gs-mycombo are
 *  suppressed since there's no combo to roll. The trailing "no combo"
 *  note matters for first-timers who type !gs-shuffle and wonder why
 *  it didn't do anything. */
const HELP_VIEWER_QUEUE_LINE =
  "JOIN: !gs-join · LOBBY: !gs-lobby (see who's in line) · LEAVE: !gs-leave · LIVE PAGE: !gs-live · No combo to roll in queue mode.";

/** Race + picks/bans lifecycle. Broadcaster-only — appears in the
 *  help reply only when the requester IS the broadcaster AND the race
 *  module is enabled on the session. */
const HELP_STREAMER_RACE_LINE =
  "STREAMER: !gs-track [N] · !gs-items · !gs-race [N] · !gs-picks-open · !gs-picks-close";

/** Moderation commands. Appears for anyone with the broadcaster or
 *  Twitch mod badge. The broadcaster sees this section even though
 *  they're not technically a mod — they can still run the actions. */
const HELP_MOD_LINE = "MODS: !gs-kick @user [min] · !gs-clear";

const HELP_NO_SESSION =
  "🎲 GameShuffle isn't running a session right now. When the streamer goes live in a supported game, type !gs-join to enter the shuffle.";

/** Prefix once, then join sections with ` · ` so the visual rhythm
 *  matches the existing in-line separator. Each section is a
 *  pre-formatted fragment (already contains its own inner separators). */
function composeHelp(sections: string[]): string {
  return `${HELP_PREFIX} ${sections.join(" · ")}`;
}

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
    case "live": {
      // Direct link to the streamer's live page — viewer asked for
      // it, give it to them with minimal framing. No session
      // requirement; the page renders a "Not live" state when the
      // streamer's offline, which is still a useful destination.
      const liveUrl = await getLiveUrlForUser(ctx.userId).catch(() => null);
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: liveLinkMessage(liveUrl),
      });
      return;
    }
    case "kick":
      if (!ctx.isModerator) return;
      await handleKickCommand(ctx, command.args);
      return;
    case "clear":
      if (!ctx.isModerator) return;
      await handleClearCommand(ctx);
      return;
    case "help": {
      // Context-aware per spec §8.2 + Phase A §5.2 update + audience-
      // targeted refinement: every requester gets the viewer commands
      // for their session state, plus the mod commands if they hold
      // mod/broadcaster, plus the streamer commands when they ARE the
      // broadcaster AND the race module is enabled. Keeps each !gs-help
      // reply short and scoped to what the caller can actually run.
      const helpSession = await resolveActiveSession(ctx.userId);
      let helpMessage: string;
      if (!helpSession) {
        helpMessage = HELP_NO_SESSION;
      } else if (!helpSession.randomizerSlug) {
        // Queue mode — viewer commands first; mods see their kick/clear
        // set appended. Streamer surface is suppressed since queue mode
        // doesn't expose race randomizer commands.
        const sections: string[] = [HELP_VIEWER_QUEUE_LINE];
        if (ctx.isModerator) sections.push(HELP_MOD_LINE);
        helpMessage = composeHelp(sections);
      } else {
        const raceModule = await getSessionModule({
          sessionId: helpSession.sessionId,
          moduleId: "race_randomizer",
          includeDisabled: false,
        }).catch(() => null);
        const sections: string[] = [HELP_VIEWER_LINE];
        if (ctx.isBroadcaster && raceModule?.enabled) {
          sections.push(HELP_STREAMER_RACE_LINE);
        }
        if (ctx.isModerator) {
          sections.push(HELP_MOD_LINE);
        }
        helpMessage = composeHelp(sections);
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
        await handleTrackCommand(raceCtx, command.args);
        return;
      case "items":
        await handleItemsCommand(raceCtx, command.args);
        return;
      case "race":
        await handleRaceCommand(raceCtx, command.args);
        return;
      case "rally":
        await handleRallyCommand(raceCtx);
        return;
      case "picks-open":
        await handlePicksOpenCommand(raceCtx);
        return;
      case "picks-close":
        await handlePicksCloseCommand(raceCtx);
        return;
    }
  }

  // Fallthrough: kart_randomizer's chat commands (shuffle, mycombo) are
  // already routed via the explicit cases above, so we don't need a
  // generic kart_randomizer branch here.
}
