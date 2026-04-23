/**
 * Dispatches a parsed chat command to the appropriate handler.
 *
 * Phase 2 ships `!gs-shuffle` for broadcaster only. Future phases add
 * !gs-join/!gs-leave/!gs-mycombo/!gs-lobby/!gs-kick/!gs-clear plus the
 * bare `!gs` info message. Unknown commands are ignored silently for now
 * (returning text for every typo would be spammy).
 */

import { sendChatMessage } from "@/lib/twitch/client";
import type { ParsedCommand } from "./parse";
import { handleShuffleCommand, type ShuffleContext } from "./shuffle";

// Dispatch-level context is just the shuffle context today; re-exported with
// its own alias so future commands with extra fields can extend it without
// touching callers.
export type CommandDispatchContext = ShuffleContext;

export async function dispatchCommand(
  command: ParsedCommand,
  ctx: CommandDispatchContext
): Promise<void> {
  switch (command.name) {
    case "shuffle":
      await handleShuffleCommand(ctx);
      return;
    case "":
      // bare `!gs` — info blurb (everyone)
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: "🎲 GameShuffle randomizes your loadout each round. More: gameshuffle.co",
      });
      return;
    default:
      // Not yet implemented — ignore quietly.
      return;
  }
}
