import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { readCollection, type GameCollection } from "@/lib/collection/core";

/**
 * Collections for chat surfaces (Twitch !gs-shuffle, Discord /gs-randomize):
 * a chatter's own collection when their platform account is linked to a
 * GameShuffle account. Never throws; no link (or no table yet) = no filter.
 */

async function byUserIds(userIds: string[], slug: string): Promise<Map<string, GameCollection>> {
  const out = new Map<string, GameCollection>();
  if (!userIds.length) return out;
  const { data, error } = await createServiceClient().from("user_game_profiles").select("user_id, data").in("user_id", userIds).eq("game_slug", slug);
  if (error) return out;
  for (const r of (data ?? []) as { user_id: string; data: unknown }[]) out.set(r.user_id, readCollection(r.data));
  return out;
}

/** One person's collection for a game, or null. */
export async function collectionForUser(userId: string, slug: string): Promise<GameCollection | null> {
  try { return (await byUserIds([userId], slug)).get(userId) ?? null; } catch { return null; }
}

/** Twitch: the sender's collection (the streamer's own when it's the broadcaster). */
export async function collectionForTwitchSender(opts: { twitchUserId: string; streamerUserId: string; isBroadcaster: boolean; slug: string }): Promise<GameCollection | null> {
  try {
    let userId: string | null = opts.isBroadcaster ? opts.streamerUserId : null;
    if (!userId) {
      const { data } = await createServiceClient().from("users").select("id").eq("twitch_id", opts.twitchUserId).limit(1);
      userId = (data as { id: string }[] | null)?.[0]?.id ?? null;
    }
    if (!userId) return null;
    return (await byUserIds([userId], opts.slug)).get(userId) ?? null;
  } catch { return null; }
}

/** Discord: collections keyed by Discord user id, for everyone tagged in one command. */
export async function collectionsForDiscordUsers(discordIds: string[], slug: string): Promise<Map<string, GameCollection>> {
  const out = new Map<string, GameCollection>();
  try {
    const ids = [...new Set(discordIds.filter(Boolean))];
    if (!ids.length) return out;
    const { data } = await createServiceClient().from("users").select("id, discord_id").in("discord_id", ids);
    const links = (data ?? []) as { id: string; discord_id: string }[];
    const cols = await byUserIds(links.map((l) => l.id), slug);
    for (const l of links) { const c = cols.get(l.id); if (c) out.set(l.discord_id, c); }
  } catch { /* no filter */ }
  return out;
}
