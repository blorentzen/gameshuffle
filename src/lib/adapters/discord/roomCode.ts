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
import { activeGuilds } from "@/lib/discord/guilds";
import { getGameName } from "@/data/game-registry";
import { boxArt, catalogForApp } from "@/data/game-catalog";
import { SITE_URL } from "@/lib/seo";
import { postEmbed } from "./adapter";
import { roomCodeEmbed } from "./embeds";

interface PushArgs {
  ownerUserId: string;
  gameSlug: string;
  roomCode: string;
}

/** Post the room-code embed to the default channel of every server that
 *  posts (all connected servers with GS Pro, the main one without). Returns
 *  true when at least one server accepted it. */
export async function pushRoomCodeUpdateToDiscord(
  args: PushArgs,
): Promise<boolean> {
  const servers = (await activeGuilds(args.ownerUserId)).filter((g) => g.defaultChannelId);
  if (servers.length === 0) return false;
  const { data: profile } = await createServiceClient()
    .from("users")
    .select("display_name, username, twitch_username")
    .eq("id", args.ownerUserId)
    .maybeSingle();
  const row = profile as { display_name: string | null; username: string | null; twitch_username: string | null } | null;

  const streamerName = row?.display_name ?? row?.username ?? row?.twitch_username ?? "Streamer";
  const gameName = getGameName(args.gameSlug);
  const cover = boxArt(catalogForApp(args.gameSlug));
  const embed = roomCodeEmbed({
    streamerName,
    gameName,
    roomCode: args.roomCode,
    changedAt: new Date().toISOString(),
    coverUrl: cover ? `${SITE_URL}${cover}` : null,
  });

  let posted = false;
  for (const server of servers) {
    const result = await postEmbed({ channelId: server.defaultChannelId!, embed });
    if (result.ok) posted = true;
    else console.warn(`[discord/roomCode] post failed for owner ${args.ownerUserId} in ${server.guildId}:`, result.error);
  }
  return posted;
}
