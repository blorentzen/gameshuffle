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

// Keep this string terse — it's a single chat message (500 char cap) and
// gets read live on stream. Update as new commands land.
const HELP_MESSAGE =
  "🎲 Commands: !gs-shuffle (broadcaster) · !gs-help · !gs — More: gameshuffle.co";

export async function dispatchCommand(
  command: ParsedCommand,
  ctx: CommandDispatchContext
): Promise<void> {
  switch (command.name) {
    case "shuffle":
      await handleShuffleCommand(ctx);
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
