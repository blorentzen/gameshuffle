import "server-only";

/**
 * Community crews — per-game representation rosters layered on top of the broad
 * `community_members` (followers). One crew per (community, game); members climb
 * a ladder: prospect → representative → captain. Read is public; writes are
 * gated to community owner/mods + that game's crew captains (a member can leave
 * their own row). See `supabase/community-crews-m1.sql`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getOrCreateScopedConversation } from "@/lib/social/messaging";

export type CrewTier = "prospect" | "representative" | "captain";
const TIER_RANK: Record<CrewTier, number> = { captain: 0, representative: 1, prospect: 2 };

export interface CrewMember {
  userId: string;
  name: string;
  username: string | null;
  avatarSource: string | null;
  avatarSeed: string | null;
  avatarOptions: Record<string, unknown> | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;
  tier: CrewTier;
}

export interface GameCrew {
  game: string;
  members: CrewMember[]; // captains → representatives → prospects
  total: number;
}

interface RawRow { community_id: string; game: string; user_id: string; tier: CrewTier }

/** All of a community's crews, grouped by game, members sorted by tier. */
export async function listCommunityCrews(communityId: string): Promise<GameCrew[]> {
  if (!communityId) return [];
  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("community_crew_members")
    .select("game, user_id, tier")
    .eq("community_id", communityId);
  const list = (rows ?? []) as Array<{ game: string; user_id: string; tier: CrewTier }>;
  if (list.length === 0) return [];

  const ids = [...new Set(list.map((r) => r.user_id))];
  const { data: users } = await admin
    .from("users")
    .select("id, display_name, username, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar")
    .in("id", ids);
  const profile = new Map<string, Record<string, unknown>>();
  for (const u of (users ?? []) as Array<{ id: string } & Record<string, unknown>>) profile.set(u.id, u);

  const byGame = new Map<string, CrewMember[]>();
  for (const r of list) {
    const u = profile.get(r.user_id) ?? {};
    const member: CrewMember = {
      userId: r.user_id,
      name: (u.display_name as string) || (u.username as string) || "Player",
      username: (u.username as string | null) ?? null,
      avatarSource: (u.avatar_source as string | null) ?? null,
      avatarSeed: (u.avatar_seed as string | null) ?? null,
      avatarOptions: (u.avatar_options as Record<string, unknown> | null) ?? null,
      discordAvatar: (u.discord_avatar as string | null) ?? null,
      twitchAvatar: (u.twitch_avatar as string | null) ?? null,
      tier: r.tier,
    };
    (byGame.get(r.game) ?? byGame.set(r.game, []).get(r.game)!).push(member);
  }

  return [...byGame.entries()]
    .map(([game, members]) => {
      members.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.name.localeCompare(b.name));
      return { game, members, total: members.length };
    })
    .sort((a, b) => b.total - a.total || a.game.localeCompare(b.game));
}

export interface UserCrew {
  communityId: string;
  communitySlug: string;
  communityName: string;
  game: string;
  tier: CrewTier;
}

/** Every crew a user represents in, across communities (for their /u profile). */
export async function getUserCrews(userId: string): Promise<UserCrew[]> {
  if (!userId) return [];
  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("community_crew_members")
    .select("community_id, game, tier")
    .eq("user_id", userId);
  const list = (rows ?? []) as Array<{ community_id: string; game: string; tier: CrewTier }>;
  if (list.length === 0) return [];

  const ids = [...new Set(list.map((r) => r.community_id))];
  const { data: comms } = await admin
    .from("gs_communities")
    .select("id, slug, display_name")
    .in("id", ids);
  const byId = new Map<string, { slug: string; name: string }>();
  for (const c of (comms ?? []) as Array<{ id: string; slug: string; display_name: string | null }>) {
    byId.set(c.id, { slug: c.slug, name: c.display_name || `@${c.slug}` });
  }

  return list
    .map((r) => {
      const c = byId.get(r.community_id);
      if (!c) return null;
      return { communityId: r.community_id, communitySlug: c.slug, communityName: c.name, game: r.game, tier: r.tier };
    })
    .filter((x): x is UserCrew => !!x)
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.game.localeCompare(b.game));
}

/** The viewer's tier in each game crew of a community (for UI state). */
export async function getViewerCrewTiers(communityId: string, userId: string): Promise<Record<string, CrewTier>> {
  if (!communityId || !userId) return {};
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_crew_members")
    .select("game, tier")
    .eq("community_id", communityId)
    .eq("user_id", userId);
  const out: Record<string, CrewTier> = {};
  for (const r of (data ?? []) as Array<{ game: string; tier: CrewTier }>) out[r.game] = r.tier;
  return out;
}

async function communityRole(userId: string, communityId: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}

/** Owner/mod of the community, or captain of the given game's crew. */
export async function canManageCrew(userId: string, communityId: string, game: string): Promise<boolean> {
  if (!userId) return false;
  const role = await communityRole(userId, communityId);
  if (role === "owner" || role === "mod") return true;
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_crew_members")
    .select("tier")
    .eq("community_id", communityId)
    .eq("game", game)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { tier: CrewTier } | null)?.tier === "captain";
}

/** A community member opts in to represent in a game (joins as prospect). */
export async function joinCrewAsProspect(
  userId: string,
  communityId: string,
  game: string,
): Promise<{ ok: boolean; reason?: string }> {
  const g = game.trim().slice(0, 80);
  if (!g) return { ok: false, reason: "invalid_game" };
  if (!(await communityRole(userId, communityId))) return { ok: false, reason: "not_a_member" };
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("community_crew_members")
    .select("tier")
    .eq("community_id", communityId)
    .eq("game", g)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return { ok: true }; // already on the crew (keep their tier)
  const { error } = await admin
    .from("community_crew_members")
    .insert({ community_id: communityId, game: g, user_id: userId, tier: "prospect", added_by: userId });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/** Promote/demote a crew member (owner/mod/captain only). */
export async function setCrewTier(
  actorId: string,
  communityId: string,
  game: string,
  targetUserId: string,
  tier: CrewTier,
): Promise<{ ok: boolean; reason?: string }> {
  if (!["prospect", "representative", "captain"].includes(tier)) return { ok: false, reason: "invalid_tier" };
  if (!(await canManageCrew(actorId, communityId, game))) return { ok: false, reason: "forbidden" };
  const admin = createServiceClient();
  const { error } = await admin
    .from("community_crew_members")
    .upsert(
      { community_id: communityId, game, user_id: targetUserId, tier, added_by: actorId },
      { onConflict: "community_id,game,user_id" },
    );
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * Open (get-or-create) the group chat for a game crew — one scoped conversation
 * per (community, game), with the whole roster synced as members. Only a crew
 * member may open it. Crew chats are `kind:'crew'`, so the DM mutual-follow gate
 * doesn't apply — teammates can coordinate regardless of who follows whom.
 */
export async function openCrewChat(
  userId: string,
  communityId: string,
  game: string,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const admin = createServiceClient();
  const { data: roster } = await admin
    .from("community_crew_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("game", game);
  const memberIds = ((roster ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  if (!memberIds.includes(userId)) return { ok: false, reason: "not_on_crew" };

  const { data: comm } = await admin
    .from("gs_communities")
    .select("slug, display_name")
    .eq("id", communityId)
    .maybeSingle();
  const name = (comm as { display_name: string | null; slug: string } | null);
  const title = `${name?.display_name || (name?.slug ? `@${name.slug}` : "Crew")} · ${game}`;

  return getOrCreateScopedConversation({
    kind: "crew",
    scopeId: `crew:${communityId}:${game}`,
    title,
    memberIds,
  });
}

/** Remove someone from a game crew (manager, or the member removing themselves). */
export async function removeFromCrew(
  actorId: string,
  communityId: string,
  game: string,
  targetUserId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (actorId !== targetUserId && !(await canManageCrew(actorId, communityId, game))) {
    return { ok: false, reason: "forbidden" };
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("community_crew_members")
    .delete()
    .eq("community_id", communityId)
    .eq("game", game)
    .eq("user_id", targetUserId);
  return error ? { ok: false, reason: error.message } : { ok: true };
}
