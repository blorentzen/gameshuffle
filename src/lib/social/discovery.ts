import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * "Find players" discovery (community Phase 2). Browse public accounts by
 * favorite game, online-now, and streamer status, on top of the existing
 * profile + presence data. Block-aware (both directions), public-only, and
 * excludes suspended/banned + the viewer themselves.
 *
 * Region/timezone filtering (the 4th chosen axis) waits on a structured
 * personal-region field — `users.location` is free text today, so it's not a
 * reliable filter yet. Deferred, not forgotten.
 */

const ONLINE_MS = 5 * 60 * 1000;

export interface PlayerSummary {
  id: string;
  username: string | null;
  displayName: string;
  avatarSource: string | null;
  avatarSeed: string | null;
  avatarOptions: Record<string, unknown> | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;
  favoriteGames: string[];
  isOnline: boolean;
  isStreamer: boolean;
  isLive: boolean;
  isFollowing: boolean;
}

/** Accounts the viewer has blocked OR who have blocked the viewer. */
async function blockedIds(viewerId: string): Promise<Set<string>> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("user_blocks")
    .select("blocker_user_id, blocked_user_id")
    .or(`blocker_user_id.eq.${viewerId},blocked_user_id.eq.${viewerId}`);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ blocker_user_id: string; blocked_user_id: string }>) {
    set.add(r.blocker_user_id === viewerId ? r.blocked_user_id : r.blocker_user_id);
  }
  return set;
}

export async function discoverPlayers(opts: {
  viewerId: string | null;
  query?: string | null;
  game?: string | null;
  onlineOnly?: boolean;
  streamersOnly?: boolean;
  limit?: number;
}): Promise<PlayerSummary[]> {
  const admin = createServiceClient();
  const limit = opts.limit ?? 60;

  let q = admin
    .from("users")
    .select(
      "id, username, display_name, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, favorite_games, last_seen_at, is_public, moderation_status",
    )
    .eq("is_public", true)
    .not("username", "is", null)
    .in("moderation_status", ["ok", "warned"]) // hide suspended/banned
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit * 2); // over-fetch so post-filters (block/streamer) still fill

  if (opts.game) q = q.contains("favorite_games", [opts.game]);
  const query = opts.query?.trim();
  if (query) q = q.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);

  const { data } = await q;
  let rows = (data ?? []) as Array<{
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_source: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    discord_avatar: string | null;
    twitch_avatar: string | null;
    favorite_games: string[] | null;
    last_seen_at: string | null;
  }>;

  // Exclude self + blocked pairs.
  if (opts.viewerId) {
    const blocked = await blockedIds(opts.viewerId);
    rows = rows.filter((r) => r.id !== opts.viewerId && !blocked.has(r.id));
  }

  // Streamer annotation — one query for the batch.
  const streamers = new Map<string, boolean>(); // id → isLive
  if (rows.length) {
    const { data: conns } = await admin
      .from("twitch_connections")
      .select("user_id, is_live")
      .in(
        "user_id",
        rows.map((r) => r.id),
      );
    for (const c of (conns ?? []) as Array<{ user_id: string; is_live: boolean }>) {
      streamers.set(c.user_id, !!c.is_live);
    }
  }

  // Who the viewer already follows — one query for the batch.
  const following = new Set<string>();
  if (opts.viewerId && rows.length) {
    const { data: f } = await admin
      .from("follows")
      .select("followee_user_id")
      .eq("follower_user_id", opts.viewerId)
      .in(
        "followee_user_id",
        rows.map((r) => r.id),
      );
    for (const r of (f ?? []) as Array<{ followee_user_id: string }>) following.add(r.followee_user_id);
  }

  const now = Date.now();
  let result: PlayerSummary[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.username || "Player",
    avatarSource: r.avatar_source,
    avatarSeed: r.avatar_seed,
    avatarOptions: r.avatar_options,
    discordAvatar: r.discord_avatar,
    twitchAvatar: r.twitch_avatar,
    favoriteGames: r.favorite_games ?? [],
    isOnline: !!r.last_seen_at && now - new Date(r.last_seen_at).getTime() < ONLINE_MS,
    isStreamer: streamers.has(r.id),
    isLive: streamers.get(r.id) === true,
    isFollowing: following.has(r.id),
  }));

  if (opts.onlineOnly) result = result.filter((p) => p.isOnline);
  if (opts.streamersOnly) result = result.filter((p) => p.isStreamer);

  return result.slice(0, limit);
}
