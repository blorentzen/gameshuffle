/**
 * Helper for pushing room-code updates to a streamer's Discord
 * notify channel. Used by:
 *   - Settings tab save flow (RaceSetupSection.roomCode field changed)
 *   - `!gs room set CODE` chat command
 *
 * Only fires when the streamer picked "Share via Discord" on the
 * active game's race module slice AND their Discord bot is properly
 * routed. All paths are best-effort — a failure here never blocks
 * the save or the chat reply.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getGameName } from "@/data/game-registry";
import { postEmbed } from "./adapter";
import { roomCodeEmbed } from "./embeds";

interface PushArgs {
  ownerUserId: string;
  gameSlug: string;
  roomCode: string;
}

/** Look up the streamer's Discord routing + post the room-code embed.
 *  Returns true when Discord accepted the post, false on any failure
 *  (no routing, no channel, API error, missing access). */
export async function pushRoomCodeUpdateToDiscord(
  args: PushArgs,
): Promise<boolean> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select(
      "display_name, username, twitch_username, discord_guild_id, discord_channel_id",
    )
    .eq("id", args.ownerUserId)
    .maybeSingle();
  const row = profile as
    | {
        display_name: string | null;
        username: string | null;
        twitch_username: string | null;
        discord_guild_id: string | null;
        discord_channel_id: string | null;
      }
    | null;
  if (!row?.discord_guild_id || !row.discord_channel_id) return false;

  const streamerName =
    row.display_name ?? row.username ?? row.twitch_username ?? "Streamer";
  const gameName = getGameName(args.gameSlug);

  const result = await postEmbed({
    channelId: row.discord_channel_id,
    embed: roomCodeEmbed({
      streamerName,
      gameName,
      roomCode: args.roomCode,
      changedAt: new Date().toISOString(),
    }),
  });
  if (!result.ok) {
    console.warn(
      `[discord/roomCode] post failed for owner ${args.ownerUserId}:`,
      result.error,
    );
    return false;
  }
  return true;
}
