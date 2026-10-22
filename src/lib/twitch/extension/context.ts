import "server-only";

/**
 * Who a Twitch channel is on GameShuffle, for the extension: the streamer who
 * connected that channel (twitch_connections), their community (where the
 * live games run) and their live page. A channel that never connected Twitch
 * on GameShuffle has no games to show: the extension says so (and the setup
 * page tells the streamer how to connect). Cached a minute per channel, since
 * every viewer's card asks.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { isProUser } from "@/lib/subscription-server";
import { getUserById, getAppAccessToken } from "@/lib/twitch/client";

export interface ExtChannel {
  broadcasterId: string;
  /** The GameShuffle account that connected this channel (null = not on GameShuffle). */
  ownerUserId: string | null;
  communityId: string | null;
  /** The streamer's live page slug (gameshuffle.co/live/<slug>). */
  slug: string | null;
  name: string;
  /** Whether the streamer's plan runs the GS Pro games (polls, bingo, break mode…). */
  pro: boolean;
  live: boolean;
}

const cache = new Map<string, { at: number; value: ExtChannel }>();
const TTL = 60_000;

export async function extChannel(broadcasterId: string): Promise<ExtChannel> {
  const hit = cache.get(broadcasterId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const svc = createServiceClient();
  const { data } = await svc.from("twitch_connections").select("user_id, twitch_login, twitch_display_name, is_live").eq("twitch_user_id", broadcasterId).maybeSingle();
  const tc = data as { user_id: string; twitch_login: string | null; twitch_display_name: string | null; is_live: boolean | null } | null;
  let value: ExtChannel;
  if (!tc) {
    value = { broadcasterId, ownerUserId: null, communityId: null, slug: null, name: await twitchName(broadcasterId), pro: false, live: false };
  } else {
    const [communityId, { data: u }, pro] = await Promise.all([
      resolveCommunityIdForOwner(tc.user_id).catch(() => null),
      svc.from("users").select("username, display_name").eq("id", tc.user_id).maybeSingle(),
      isProUser(tc.user_id).catch(() => false),
    ]);
    const user = u as { username: string | null; display_name: string | null } | null;
    value = {
      broadcasterId,
      ownerUserId: tc.user_id,
      communityId,
      slug: user?.username ?? tc.twitch_login ?? null,
      name: tc.twitch_display_name || user?.display_name || tc.twitch_login || "This channel",
      pro,
      live: !!tc.is_live,
    };
  }
  cache.set(broadcasterId, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return value;
}

/** A Twitch user's display name (cached ten minutes), for channels and viewers we haven't seen. */
const names = new Map<string, { at: number; name: string }>();
export async function twitchName(userId: string): Promise<string> {
  const hit = names.get(userId);
  if (hit && Date.now() - hit.at < 600_000) return hit.name;
  let name = "A viewer";
  try {
    const u = await getUserById(userId, await getAppAccessToken());
    if (u?.display_name) name = u.display_name;
  } catch { /* Twitch unreachable: a plain name for now */ }
  names.set(userId, { at: Date.now(), name });
  if (names.size > 5000) names.delete(names.keys().next().value!);
  return name;
}
