/**
 * Dispatches a parsed chat command to the appropriate handler.
 *
 * Phase 2 shipped !gs-shuffle (broadcaster) + !gs / !gs-help.
 * Phase 3 adds the viewer participation surface (!gs-join, !gs-leave,
 * !gs-mycombo, !gs-lobby), the mod surface (!gs-kick, !gs-clear), and
 * extends !gs-shuffle to active participants.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import type { ParsedCommand } from "./parse";
import { handleShuffleCommand, type ShuffleContext } from "./shuffle";
import {
  handleJoinCommand,
  handleLeaveCommand,
  handleLobbyCommand,
  handleMyComboCommand,
} from "./participants";
import { handleClearCommand, handleKickCommand } from "./moderation";

export interface CommandDispatchContext extends ShuffleContext {
  /** True when sender has the moderator OR broadcaster badge. */
  isModerator: boolean;
}

// Keep this string terse — it's a single chat message (500 char cap) and
// gets read live on stream. Update as new commands land.
const HELP_MESSAGE =
  "🎲 Commands: !gs-join · !gs-leave · !gs-shuffle · !gs-mycombo · !gs-lobby · !gs-help";

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
    default:
      // Not yet implemented — ignore quietly.
      return;
  }
}
