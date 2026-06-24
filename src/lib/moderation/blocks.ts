import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Whether two users are blocked relative to each other — true if EITHER
 * blocked the other. Used to hide profiles + stop interaction (and any
 * future comms surface) between the pair. Ids are auth uuids.
 */
export async function isBlocked(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const admin = createServiceClient();
  const { data } = await admin
    .from("user_blocks")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${a},blocked_user_id.eq.${b}),and(blocker_user_id.eq.${b},blocked_user_id.eq.${a})`,
    )
    .limit(1);
  return !!(data && data.length);
}

export interface BlockedSummary {
  userId: string;
  username: string | null;
  displayName: string | null;
  createdAt: string;
}

/** The accounts a user has blocked, with display info, newest first. */
export async function listBlockedByUser(userId: string): Promise<BlockedSummary[]> {
  const admin = createServiceClient();
  const { data: blocks } = await admin
    .from("user_blocks")
    .select("blocked_user_id, created_at")
    .eq("blocker_user_id", userId)
    .order("created_at", { ascending: false });
  const rows = (blocks ?? []) as Array<{ blocked_user_id: string; created_at: string }>;
  if (!rows.length) return [];

  const { data: users } = await admin
    .from("users")
    .select("id, username, display_name")
    .in("id", rows.map((r) => r.blocked_user_id));
  const byId = new Map(
    ((users ?? []) as Array<{ id: string; username: string | null; display_name: string | null }>).map(
      (u) => [u.id, u],
    ),
  );

  return rows.map((r) => {
    const u = byId.get(r.blocked_user_id);
    return {
      userId: r.blocked_user_id,
      username: u?.username ?? null,
      displayName: u?.display_name ?? null,
      createdAt: r.created_at,
    };
  });
}

export async function addBlock(blockerId: string, blockedId: string): Promise<void> {
  if (!blockedId || blockerId === blockedId) return;
  const admin = createServiceClient();
  await admin
    .from("user_blocks")
    .upsert(
      { blocker_user_id: blockerId, blocked_user_id: blockedId },
      { onConflict: "blocker_user_id,blocked_user_id" },
    );
  // Blocking severs the follow relationship in both directions.
  await admin
    .from("follows")
    .delete()
    .or(
      `and(follower_user_id.eq.${blockerId},followee_user_id.eq.${blockedId}),and(follower_user_id.eq.${blockedId},followee_user_id.eq.${blockerId})`,
    );
}

export async function removeBlock(blockerId: string, blockedId: string): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", blockerId)
    .eq("blocked_user_id", blockedId);
}
