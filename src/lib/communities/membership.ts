/**
 * Community membership (Phase 2) — the joinable layer over `gs_communities`.
 *
 * A community is a streamer's channel (the token-economy scope); membership lets
 * viewers/players JOIN it, which is what the community home, scoped feed, and
 * per-community leaderboard hang off of. Members are GS accounts (public.users).
 *
 * Joining also fires the one-time `join_community` onboarding grant (best-effort
 * — a grant failure never blocks the join). Backed by `supabase/communities-m1.sql`.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet, grantOnboardingMilestone } from "@/lib/economy/accountWallet";
import { sanitizeCommunityLinks, type CommunityLink } from "@/data/community-links";

export type CommunityRole = "member" | "mod" | "owner";

export interface CommunitySummary {
  id: string;
  slug: string;
  displayName: string | null;
  ownerIdentityId: string;
  ownerUserId: string | null;
}

export interface CommunityMember {
  userId: string;
  role: CommunityRole;
  joinedAt: string;
  displayName: string | null;
  username: string | null;
  online: boolean;
  /** Equipped Arcade name-color item id, if any (resolve via resolveNameColor). */
  nameColorItem: string | null;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Read a community by its slug (streamer username). Null if none. */
export async function getCommunityBySlug(slug: string): Promise<CommunitySummary | null> {
  if (!slug) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("id, slug, display_name, owner_identity_id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  return hydrateSummary(admin, data as RawCommunity);
}

/** Read a community by id. Null if none. */
export async function getCommunityById(id: string): Promise<CommunitySummary | null> {
  if (!id) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("id, slug, display_name, owner_identity_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return hydrateSummary(admin, data as RawCommunity);
}

interface RawCommunity { id: string; slug: string; display_name: string | null; owner_identity_id: string }

async function hydrateSummary(admin: ReturnType<typeof createServiceClient>, c: RawCommunity): Promise<CommunitySummary> {
  // Map the owner's economy identity back to a GS account for display/links.
  const { data: owner } = await admin
    .from("gs_identities")
    .select("gs_account_id")
    .eq("id", c.owner_identity_id)
    .maybeSingle();
  return {
    id: c.id,
    slug: c.slug,
    displayName: c.display_name,
    ownerIdentityId: c.owner_identity_id,
    ownerUserId: (owner as { gs_account_id: string | null } | null)?.gs_account_id ?? null,
  };
}

export interface JoinResult {
  ok: boolean;
  alreadyMember: boolean;
  role?: CommunityRole;
  reason?: string;
}

/**
 * Join a community. Idempotent — a second join is a no-op that reports
 * `alreadyMember`. On the first join it fires the `join_community` onboarding
 * grant (best-effort).
 */
export async function joinCommunity(
  userId: string,
  communityId: string,
  role: CommunityRole = "member",
): Promise<JoinResult> {
  if (!userId || !communityId) return { ok: false, alreadyMember: false, reason: "invalid_args" };
  const admin = createServiceClient();

  const { data: existing } = await admin
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return { ok: true, alreadyMember: true, role: (existing as { role: CommunityRole }).role };
  }

  const { error } = await admin
    .from("community_members")
    .insert({ community_id: communityId, user_id: userId, role });
  if (error) {
    // Unique-violation race → treat as already a member.
    if (error.code === "23505") return { ok: true, alreadyMember: true };
    return { ok: false, alreadyMember: false, reason: error.message };
  }

  // Reward the first join — never let a grant error fail the join.
  try {
    await ensureAccountWallet(userId);
    await grantOnboardingMilestone(userId, "join_community");
  } catch (err) {
    console.error("[communities] join grant failed:", err);
  }

  return { ok: true, alreadyMember: false, role };
}

/** Leave a community. Idempotent. */
export async function leaveCommunity(userId: string, communityId: string): Promise<{ ok: boolean }> {
  if (!userId || !communityId) return { ok: false };
  const admin = createServiceClient();
  await admin
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", userId);
  return { ok: true };
}

/** Is this account a member of the community? */
export async function isMember(userId: string, communityId: string): Promise<boolean> {
  if (!userId || !communityId) return false;
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Member count for a community. */
export async function getMemberCount(communityId: string): Promise<number> {
  if (!communityId) return 0;
  const admin = createServiceClient();
  const { count } = await admin
    .from("community_members")
    .select("user_id", { count: "exact", head: true })
    .eq("community_id", communityId);
  return count ?? 0;
}

/** List a community's members (newest first), joined to profile display fields. */
export async function listMembers(communityId: string, limit = 60): Promise<CommunityMember[]> {
  if (!communityId) return [];
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_members")
    .select("user_id, role, joined_at, users:user_id(display_name, username, last_seen_at, equipped_name_color)")
    .eq("community_id", communityId)
    .order("joined_at", { ascending: false })
    .limit(limit);
  const now = Date.now();
  return ((data ?? []) as unknown as RawMemberRow[]).map((r) => {
    const seen = r.users?.last_seen_at ? new Date(r.users.last_seen_at).getTime() : 0;
    return {
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
      displayName: r.users?.display_name ?? null,
      username: r.users?.username ?? null,
      online: seen > 0 && now - seen < ONLINE_WINDOW_MS,
      nameColorItem: r.users?.equipped_name_color ?? null,
    };
  });
}

interface RawMemberRow {
  user_id: string;
  role: CommunityRole;
  joined_at: string;
  users: { display_name: string | null; username: string | null; last_seen_at: string | null; equipped_name_color: string | null } | null;
}

export interface CommunityCard {
  id: string;
  slug: string;
  displayName: string | null;
  memberCount: number;
  /** Platforms the creator has linked (for at-a-glance discovery icons). */
  platforms: string[];
}

/**
 * Browse communities for the discovery hub, most members first. Lightweight —
 * skips the owner-account lookup (cards link by slug). Fine for the current
 * community count; swap to a grouped count / cached member_count column if the
 * directory grows large.
 */
export async function listCommunities(limit = 50): Promise<CommunityCard[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("id, slug, display_name")
    .order("created_at", { ascending: false })
    .limit(limit);
  const communities = (data ?? []) as { id: string; slug: string; display_name: string | null }[];
  const cards = await Promise.all(
    communities.map(async (c) => {
      const [memberCount, links] = await Promise.all([getMemberCount(c.id), getCommunityLinks(c.id)]);
      return {
        id: c.id,
        slug: c.slug,
        displayName: c.display_name,
        memberCount,
        platforms: links.map((l) => l.platform),
      };
    }),
  );
  return cards.sort((a, b) => b.memberCount - a.memberCount);
}

/**
 * A community's creator links ("where to find us"). Resilient — returns [] if
 * the links column isn't there yet (migration communities-m3-links pending).
 */
export async function getCommunityLinks(communityId: string): Promise<CommunityLink[]> {
  if (!communityId) return [];
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_communities")
    .select("links")
    .eq("id", communityId)
    .maybeSingle();
  if (error || !data) return [];
  return sanitizeCommunityLinks((data as { links: unknown }).links);
}

/** Update a community's creator links. Owner only (owner = the account that
 *  owns the community's economy identity). Returns the sanitized links. */
export async function updateCommunityLinks(
  userId: string,
  communityId: string,
  links: unknown,
): Promise<{ ok: boolean; links?: CommunityLink[]; reason?: string }> {
  if (!userId || !communityId) return { ok: false, reason: "invalid_args" };
  const community = await getCommunityById(communityId);
  if (!community) return { ok: false, reason: "not_found" };
  if (community.ownerUserId !== userId) return { ok: false, reason: "forbidden" };

  const clean = sanitizeCommunityLinks(links);
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_communities")
    .update({ links: clean })
    .eq("id", communityId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, links: clean };
}

/** Communities a user has joined. */
export async function listCommunitiesForUser(userId: string): Promise<CommunitySummary[]> {
  if (!userId) return [];
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_members")
    .select("community:community_id(id, slug, display_name, owner_identity_id)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  const rows = (data ?? []) as unknown as { community: RawCommunity | null }[];
  const out: CommunitySummary[] = [];
  for (const row of rows) {
    if (row.community) out.push(await hydrateSummary(admin, row.community));
  }
  return out;
}
