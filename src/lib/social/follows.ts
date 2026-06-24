import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlocked } from "@/lib/moderation/blocks";
import { createNotification } from "@/lib/social/notifications";

export interface FollowCounts {
  followers: number;
  following: number;
}
export interface FollowState {
  isFollowing: boolean;
  isMutual: boolean;
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const admin = createServiceClient();
  const [followers, following] = await Promise.all([
    admin
      .from("follows")
      .select("follower_user_id", { count: "exact", head: true })
      .eq("followee_user_id", userId),
    admin
      .from("follows")
      .select("followee_user_id", { count: "exact", head: true })
      .eq("follower_user_id", userId),
  ]);
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

/** Viewer's relationship to a profile: do they follow, and is it mutual? */
export async function getFollowState(
  viewerId: string,
  profileId: string,
): Promise<FollowState> {
  if (!viewerId || viewerId === profileId) return { isFollowing: false, isMutual: false };
  const admin = createServiceClient();
  const { data } = await admin
    .from("follows")
    .select("follower_user_id, followee_user_id")
    .or(
      `and(follower_user_id.eq.${viewerId},followee_user_id.eq.${profileId}),and(follower_user_id.eq.${profileId},followee_user_id.eq.${viewerId})`,
    );
  const rows = (data ?? []) as Array<{ follower_user_id: string; followee_user_id: string }>;
  const isFollowing = rows.some(
    (r) => r.follower_user_id === viewerId && r.followee_user_id === profileId,
  );
  const followsBack = rows.some(
    (r) => r.follower_user_id === profileId && r.followee_user_id === viewerId,
  );
  return { isFollowing, isMutual: isFollowing && followsBack };
}

export async function follow(
  followerId: string,
  followeeId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!followeeId || followerId === followeeId) return { ok: false, reason: "invalid" };
  if (await isBlocked(followerId, followeeId)) return { ok: false, reason: "blocked" };
  const admin = createServiceClient();

  // Only notify on a genuinely new follow (not a repeat).
  const { data: existing } = await admin
    .from("follows")
    .select("follower_user_id")
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId)
    .maybeSingle();
  if (existing) return { ok: true };

  await admin
    .from("follows")
    .insert({ follower_user_id: followerId, followee_user_id: followeeId });

  const { data: f } = await admin
    .from("users")
    .select("display_name, username")
    .eq("id", followerId)
    .maybeSingle();
  const name = (f?.display_name as string | null) || (f?.username as string | null) || "Someone";
  await createNotification({
    userId: followeeId,
    type: "follow",
    title: `${name} followed you`,
    actorUserId: followerId,
    link: f?.username ? `/u/${f.username}` : null,
  });

  return { ok: true };
}

export async function unfollow(followerId: string, followeeId: string): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("follows")
    .delete()
    .eq("follower_user_id", followerId)
    .eq("followee_user_id", followeeId);
}
