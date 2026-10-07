/**
 * `!gs setup` — a match roll (mods + host). Rolls what everyone plays on for
 * the game on stream (tracks, a stage and rules, a board and turns, a map, a
 * battle, a course, the whole N64 match) from that game's randomizer
 * (src/lib/twitch/chatSetups.ts), posts it to chat and shows it on the
 * overlay as one card, recorded as a streamer shuffle event whose roll is
 * kind "setup". Nobody's own pick changes.
 */

import "server-only";
import { findTwitchSessionForUser, listActiveTwitchParticipants, recordTwitchShuffleEvent } from "@/lib/sessions/twitch-platform";
import { getChatGame } from "@/lib/twitch/chatGames";
import { CHAT_SETUPS } from "@/lib/twitch/chatSetups";
import { lineupMessages } from "./battle";
import { adapterFor, type ShuffleContext } from "./shuffle";

export async function handleSetupCommand(ctx: ShuffleContext): Promise<void> {
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const adapter = adapterFor(ctx, session?.id ?? "no-session");
  if (!session) {
    if (ctx.isBroadcaster) await adapter.postChatMessage("🎲 No active shuffle session. Go live in a supported game (or start a test session from your dashboard).");
    return;
  }
  const game = getChatGame(session.randomizer_slug);
  const setup = game ? CHAT_SETUPS[game.slug] : undefined;
  if (!game || !setup) {
    await adapter.postChatMessage("🎲 Match rolls need a game GameShuffle can roll for. This session is a queue.");
    return;
  }

  const platform = ctx.platform === "youtube" ? "youtube" : "twitch";
  const players = (await listActiveTwitchParticipants(session.id, platform)).length;
  const roll = setup.roll({ arg: ctx.args ?? "", players });
  if (!roll.slots.length) {
    await adapter.postChatMessage(roll.text);
    return;
  }

  // "🏁 Grand Prix, 4 races: 1. Mushroom Gorge · 2. …": the heading, then the
  // parts, split over messages where a long set needs it (YouTube caps a
  // message at 200 characters, Twitch at 500).
  const cut = roll.text.indexOf(": ");
  const head = cut >= 0 ? roll.text.slice(0, cut + 1) : roll.text;
  const parts = cut >= 0 ? roll.text.slice(cut + 2).split(" · ") : [];
  for (const message of lineupMessages(head, parts, null, platform === "youtube" ? 190 : 480)) {
    await adapter.postChatMessage(message);
  }

  await recordTwitchShuffleEvent({
    sessionId: session.id,
    twitchUserId: ctx.senderTwitchId,
    twitchDisplayName: ctx.senderDisplayName,
    triggerType: "setup",
    combo: roll as unknown as Record<string, unknown>,
    isBroadcaster: true,
  });
}
