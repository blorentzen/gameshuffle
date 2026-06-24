import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface FriendProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarSource: string | null;
  avatarSeed: string | null;
  avatarOptions: Record<string, string> | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;
  isOnline: boolean;
}

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_source: string | null;
  avatar_seed: string | null;
  avatar_options: Record<string, string> | null;
  discord_avatar: string | null;
  twitch_avatar: string | null;
  last_seen_at: string | null;
  is_public: boolean | null;
}

const PROFILE_COLS =
  "id, username, display_name, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, last_seen_at, is_public";
const ONLINE_MS = 5 * 60 * 1000;
export const MAX_TOP_FRIENDS = 12;

function toFriend(r: ProfileRow): FriendProfile {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarSource: r.avatar_source,
    avatarSeed: r.avatar_seed,
    avatarOptions: r.avatar_options,
    discordAvatar: r.discord_avatar,
    twitchAvatar: r.twitch_avatar,
    isOnline: !!r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < ONLINE_MS,
  };
}

/** The owner's curated top friends, in order, public profiles only. */
export async function getTopFriends(userId: string): Promise<FriendProfile[]> {
  const admin = createServiceClient();
  const { data: u } = await admin
    .from("users")
    .select("top_friends")
    .eq("id", userId)
    .maybeSingle();
  const ids = ((u?.top_friends as string[] | null) ?? []).filter(Boolean);
  if (!ids.length) return [];

  const { data } = await admin.from("users").select(PROFILE_COLS).in("id", ids);
  const byId = new Map(((data ?? []) as ProfileRow[]).map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is ProfileRow => !!r && r.is_public !== false)
    .map(toFriend);
}

/** People the owner follows (the pool to pick top friends from). */
export async function getFollowingProfiles(userId: string): Promise<FriendProfile[]> {
  const admin = createServiceClient();
  const { data: f } = await admin
    .from("follows")
    .select("followee_user_id")
    .eq("follower_user_id", userId)
    .limit(200);
  const ids = ((f ?? []) as { followee_user_id: string }[]).map((r) => r.followee_user_id);
  if (!ids.length) return [];

  const { data } = await admin.from("users").select(PROFILE_COLS).in("id", ids);
  return ((data ?? []) as ProfileRow[]).map(toFriend);
}

export type Connection = FriendProfile & { isFollowing: boolean };

/** Followers or following list for a user, annotated with the viewer's own
 *  follow state per row (for the in-list Follow button). */
export async function getConnections(
  userId: string,
  type: "followers" | "following",
  viewerId?: string,
): Promise<Connection[]> {
  const admin = createServiceClient();
  const keyCol = type === "followers" ? "followee_user_id" : "follower_user_id";
  const otherCol = type === "followers" ? "follower_user_id" : "followee_user_id";

  const { data: f } = await admin
    .from("follows")
    .select(otherCol)
    .eq(keyCol, userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = ((f ?? []) as Record<string, string>[]).map((r) => r[otherCol]).filter(Boolean);
  if (!ids.length) return [];

  const { data } = await admin.from("users").select(PROFILE_COLS).in("id", ids);
  const profiles = ((data ?? []) as ProfileRow[]).filter((r) => r.is_public !== false);

  let followingSet = new Set<string>();
  if (viewerId && profiles.length) {
    const { data: vf } = await admin
      .from("follows")
      .select("followee_user_id")
      .eq("follower_user_id", viewerId)
      .in(
        "followee_user_id",
        profiles.map((p) => p.id),
      );
    followingSet = new Set(((vf ?? []) as { followee_user_id: string }[]).map((r) => r.followee_user_id));
  }

  return profiles.map((r) => ({ ...toFriend(r), isFollowing: followingSet.has(r.id) }));
}

/** Persist the owner's top friends — only ids they actually follow, capped + deduped. */
export async function setTopFriends(userId: string, friendIds: string[]): Promise<void> {
  const admin = createServiceClient();
  const { data: f } = await admin
    .from("follows")
    .select("followee_user_id")
    .eq("follower_user_id", userId);
  const followed = new Set(((f ?? []) as { followee_user_id: string }[]).map((r) => r.followee_user_id));
  const clean = [...new Set(friendIds)].filter((id) => followed.has(id)).slice(0, MAX_TOP_FRIENDS);
  await admin
    .from("users")
    .update({ top_friends: clean.length ? clean : null })
    .eq("id", userId);
}
