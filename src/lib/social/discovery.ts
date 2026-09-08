import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { ONLINE_MS } from "@/lib/social/presence";
import { regionFromTimezone, asRegion, type Region } from "@/lib/social/region";

/**
 * "Find players" discovery (community Phase 2 + relevance). Browse public
 * accounts across favorite game, board-game preferences, online-now, streamer
 * status, and region, on top of the existing profile + presence data.
 *
 * When there's a viewer we RANK the results by relevance — shared favorite
 * games, mutual connections (people you follow who also follow them), and
 * board-game overlap (genres, level, length) — instead of raw recency. The
 * card surfaces the "why" (shared games, N mutuals). Block-aware (both
 * directions), public-only, excludes suspended/banned + the viewer themselves.
 *
 * Region is derived from `users.timezone` (auto-detected on sign-in).
 */

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
  region: Region | null;
  isOnline: boolean;
  isStreamer: boolean;
  isLive: boolean;
  isFollowing: boolean;
  // Board-game prefs (from the board-game-nights layer).
  playsBoardGames: boolean;
  boardGameGenres: string[];
  boardGameLevel: string | null;
  // Relevance context (populated when there's a viewer).
  sharedGames: string[];
  sharedBoardGenres: string[];
  mutuals: number;
  relevance: number;
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

/** The viewer's own signals used to score candidates. */
interface ViewerContext {
  favoriteGames: Set<string>;
  boardGenres: Set<string>;
  boardLevel: string | null;
  boardLengths: Set<string>;
  followees: string[];
}

async function loadViewerContext(viewerId: string): Promise<ViewerContext> {
  const admin = createServiceClient();
  const [{ data: me }, { data: follows }] = await Promise.all([
    admin
      .from("users")
      .select("favorite_games, board_game_genres, board_game_level, board_game_lengths")
      .eq("id", viewerId)
      .maybeSingle(),
    admin.from("follows").select("followee_user_id").eq("follower_user_id", viewerId),
  ]);
  return {
    favoriteGames: new Set<string>(((me?.favorite_games as string[] | null) ?? [])),
    boardGenres: new Set<string>(((me?.board_game_genres as string[] | null) ?? [])),
    boardLevel: (me?.board_game_level as string | null) ?? null,
    boardLengths: new Set<string>(((me?.board_game_lengths as string[] | null) ?? [])),
    followees: ((follows ?? []) as Array<{ followee_user_id: string }>).map((f) => f.followee_user_id),
  };
}

/** For each candidate, how many of the viewer's followees also follow them. */
async function mutualsFor(followees: string[], candidateIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!followees.length || !candidateIds.length) return counts;
  const admin = createServiceClient();
  const { data } = await admin
    .from("follows")
    .select("followee_user_id")
    .in("follower_user_id", followees)
    .in("followee_user_id", candidateIds);
  for (const r of (data ?? []) as Array<{ followee_user_id: string }>) {
    counts.set(r.followee_user_id, (counts.get(r.followee_user_id) ?? 0) + 1);
  }
  return counts;
}

export async function discoverPlayers(opts: {
  viewerId: string | null;
  query?: string | null;
  game?: string | null;
  region?: string | null;
  onlineOnly?: boolean;
  streamersOnly?: boolean;
  playsBoardGames?: boolean;
  boardGenre?: string | null;
  boardLevel?: string | null;
  boardLength?: string | null;
  limit?: number;
}): Promise<PlayerSummary[]> {
  const admin = createServiceClient();
  const limit = opts.limit ?? 60;
  const region = asRegion(opts.region);

  let q = admin
    .from("users")
    .select(
      "id, username, display_name, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, favorite_games, plays_board_games, board_game_genres, board_game_level, board_game_lengths, timezone, last_seen_at, is_public, moderation_status",
    )
    .eq("is_public", true)
    .not("username", "is", null)
    .in("moderation_status", ["ok", "warned"]) // hide suspended/banned
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit * 3); // over-fetch so post-filters + ranking have a real pool

  if (opts.game) q = q.contains("favorite_games", [opts.game]);
  if (opts.playsBoardGames) q = q.eq("plays_board_games", true);
  if (opts.boardGenre) q = q.contains("board_game_genres", [opts.boardGenre]);
  if (opts.boardLevel) q = q.eq("board_game_level", opts.boardLevel);
  if (opts.boardLength) q = q.contains("board_game_lengths", [opts.boardLength]);
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
    plays_board_games: boolean | null;
    board_game_genres: string[] | null;
    board_game_level: string | null;
    board_game_lengths: string[] | null;
    timezone: string | null;
    last_seen_at: string | null;
  }>;

  // Exclude self + blocked pairs, and load the viewer's scoring context.
  let viewer: ViewerContext | null = null;
  if (opts.viewerId) {
    const [blocked, ctx] = await Promise.all([
      blockedIds(opts.viewerId),
      loadViewerContext(opts.viewerId),
    ]);
    rows = rows.filter((r) => r.id !== opts.viewerId && !blocked.has(r.id));
    viewer = ctx;
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

  // Who the viewer already follows + mutual-connection counts — batch queries.
  const following = new Set<string>();
  let mutuals = new Map<string, number>();
  if (viewer && rows.length) {
    const candidateIds = rows.map((r) => r.id);
    const [{ data: f }, m] = await Promise.all([
      admin
        .from("follows")
        .select("followee_user_id")
        .eq("follower_user_id", opts.viewerId!)
        .in("followee_user_id", candidateIds),
      mutualsFor(viewer.followees, candidateIds),
    ]);
    for (const r of (f ?? []) as Array<{ followee_user_id: string }>) following.add(r.followee_user_id);
    mutuals = m;
  }

  const now = Date.now();
  let result: PlayerSummary[] = rows.map((r) => {
    const favoriteGames = r.favorite_games ?? [];
    const boardGameGenres = r.board_game_genres ?? [];
    const sharedGames = viewer ? favoriteGames.filter((g) => viewer!.favoriteGames.has(g)) : [];
    const sharedBoardGenres = viewer ? boardGameGenres.filter((g) => viewer!.boardGenres.has(g)) : [];
    const mutualCount = mutuals.get(r.id) ?? 0;
    const isOnline = !!r.last_seen_at && now - new Date(r.last_seen_at).getTime() < ONLINE_MS;
    const isLive = streamers.get(r.id) === true;

    // Relevance — shared taste weighs most, then who you know, then board fit.
    let relevance = 0;
    if (viewer) {
      relevance += sharedGames.length * 3;
      relevance += mutualCount * 2;
      relevance += sharedBoardGenres.length * 1;
      if (r.board_game_level && r.board_game_level === viewer.boardLevel) relevance += 1;
      if ((r.board_game_lengths ?? []).some((l) => viewer!.boardLengths.has(l))) relevance += 1;
      if (isLive) relevance += 1;
      else if (isOnline) relevance += 0.5;
    }

    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.username || "Player",
      avatarSource: r.avatar_source,
      avatarSeed: r.avatar_seed,
      avatarOptions: r.avatar_options,
      discordAvatar: r.discord_avatar,
      twitchAvatar: r.twitch_avatar,
      favoriteGames,
      region: regionFromTimezone(r.timezone),
      isOnline,
      isStreamer: streamers.has(r.id),
      isLive,
      isFollowing: following.has(r.id),
      playsBoardGames: !!r.plays_board_games,
      boardGameGenres,
      boardGameLevel: r.board_game_level,
      sharedGames,
      sharedBoardGenres,
      mutuals: mutualCount,
      relevance,
    };
  });

  if (opts.onlineOnly) result = result.filter((p) => p.isOnline);
  if (opts.streamersOnly) result = result.filter((p) => p.isStreamer);
  if (region) result = result.filter((p) => p.region === region);

  // Rank by relevance when we have a viewer (stable — the SQL recency order is
  // the tiebreak); otherwise keep the recency order from the query.
  if (viewer) {
    result = result
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.relevance - a.p.relevance || a.i - b.i)
      .map(({ p }) => p);
  }

  return result.slice(0, limit);
}
