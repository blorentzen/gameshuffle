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
import { COMMUNITY_SECTION_KEYS, defaultHiddenSectionsForSubtype } from "@/data/community-sections";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet, grantOnboardingMilestone } from "@/lib/economy/accountWallet";
import { sanitizeCommunityLinks, type CommunityLink } from "@/data/community-links";
import { validateUsername } from "@/lib/username";
import { resolveProfileSkin, DEFAULT_PROFILE_SKIN, type ProfileSkin } from "@/lib/profile/skin";

const MAX_GROUPS_PER_USER = 5;
const VALID_SUBTYPES = new Set(["family", "friends", "org", "event", "other"]);

export type CommunityRole = "member" | "mod" | "admin" | "owner";

export interface CommunitySummary {
  id: string;
  slug: string;
  displayName: string | null;
  ownerIdentityId: string | null;
  ownerUserId: string | null;
  /** channel = Twitch-auto (economy/live/overlay); group = general community. */
  kind: "channel" | "group";
  /** Optional group flavor (family/org/event/friends/other). */
  subtype: string | null;
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

// Full column set includes the type-split columns; falls back to the minimal
// set when the community-types migration isn't applied yet.
const COMMUNITY_FULL_COLS = "id, slug, display_name, owner_identity_id, owner_user_id, kind, subtype";
const COMMUNITY_MIN_COLS = "id, slug, display_name, owner_identity_id";

async function fetchCommunityRow(
  admin: ReturnType<typeof createServiceClient>,
  column: "slug" | "id",
  value: string,
): Promise<RawCommunity | null> {
  let res = await admin.from("gs_communities").select(COMMUNITY_FULL_COLS).eq(column, value).maybeSingle();
  if (res.error) {
    res = await admin.from("gs_communities").select(COMMUNITY_MIN_COLS).eq(column, value).maybeSingle();
  }
  return (res.data as RawCommunity | null) ?? null;
}

/** Read a community by its slug. Null if none. */
export async function getCommunityBySlug(slug: string): Promise<CommunitySummary | null> {
  if (!slug) return null;
  const admin = createServiceClient();
  const row = await fetchCommunityRow(admin, "slug", slug.toLowerCase());
  return row ? hydrateSummary(admin, row) : null;
}

/** Read a community by id. Null if none. */
export async function getCommunityById(id: string): Promise<CommunitySummary | null> {
  if (!id) return null;
  const admin = createServiceClient();
  const row = await fetchCommunityRow(admin, "id", id);
  return row ? hydrateSummary(admin, row) : null;
}

interface RawCommunity {
  id: string;
  slug: string;
  display_name: string | null;
  owner_identity_id: string | null;
  owner_user_id?: string | null;
  kind?: string | null;
  subtype?: string | null;
}

async function hydrateSummary(admin: ReturnType<typeof createServiceClient>, c: RawCommunity): Promise<CommunitySummary> {
  // Group communities own directly (owner_user_id); channel communities map the
  // owner's economy identity back to a GS account.
  let ownerUserId = c.owner_user_id ?? null;
  if (!ownerUserId && c.owner_identity_id) {
    const { data: owner } = await admin
      .from("gs_identities")
      .select("gs_account_id")
      .eq("id", c.owner_identity_id)
      .maybeSingle();
    ownerUserId = (owner as { gs_account_id: string | null } | null)?.gs_account_id ?? null;
  }
  return {
    id: c.id,
    slug: c.slug,
    displayName: c.display_name,
    ownerIdentityId: c.owner_identity_id ?? null,
    ownerUserId,
    kind: c.kind === "group" ? "group" : "channel",
    subtype: c.subtype ?? null,
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

/**
 * Create a general (`group`) community — a family/org/event/friend-group
 * community with no stream attached. Slug shares the /c namespace with channel
 * handles, so it's validated + reserved with the username rules. The creator is
 * auto-joined as owner, and section defaults come from the subtype. See
 * `specs/gs-community-types-spec.md`.
 */
/**
 * Live availability check for a would-be community slug — same rules as
 * createGroupCommunity (valid format, not taken by a community or a username).
 * Returns `available:false` with a reason for anything that would be rejected.
 */
export async function isCommunitySlugAvailable(rawSlug: string): Promise<{ available: boolean; reason?: string }> {
  const slugCheck = validateUsername(rawSlug);
  if (!slugCheck.ok) return { available: false, reason: slugCheck.error };
  const slug = slugCheck.value;
  const admin = createServiceClient();
  const { data: taken } = await admin.from("gs_communities").select("id").eq("slug", slug).maybeSingle();
  if (taken) return { available: false, reason: "slug_taken" };
  const { data: userTaken } = await admin.from("users").select("id").eq("username", slug).maybeSingle();
  if (userTaken) return { available: false, reason: "slug_taken" };
  return { available: true };
}

export async function createGroupCommunity(
  userId: string,
  input: { name: string; slug: string; subtype?: string | null; visibility?: string | null },
): Promise<{ ok: boolean; slug?: string; reason?: string }> {
  if (!userId) return { ok: false, reason: "unauthenticated" };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, reason: "name_required" };

  const slugCheck = validateUsername(input.slug);
  if (!slugCheck.ok) return { ok: false, reason: slugCheck.error };
  const slug = slugCheck.value;

  const subtype = input.subtype && VALID_SUBTYPES.has(input.subtype) ? input.subtype : "other";
  const admin = createServiceClient();

  // Slug must not collide with any existing community (channel handle or group).
  const { data: taken } = await admin.from("gs_communities").select("id").eq("slug", slug).maybeSingle();
  if (taken) return { ok: false, reason: "slug_taken" };
  // ...nor with a username (channels use the handle as their slug).
  const { data: userTaken } = await admin.from("users").select("id").eq("username", slug).maybeSingle();
  if (userTaken) return { ok: false, reason: "slug_taken" };

  // Soft anti-spam cap (adjustable later).
  const { count } = await admin
    .from("gs_communities")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);
  if ((count ?? 0) >= MAX_GROUPS_PER_USER) return { ok: false, reason: "group_cap" };

  const { data: created, error } = await admin
    .from("gs_communities")
    .insert({
      slug,
      display_name: name,
      kind: "group",
      owner_user_id: userId,
      created_by: userId,
      subtype,
      hidden_sections: defaultHiddenSectionsForSubtype(subtype),
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, reason: error?.message ?? "create_failed" };

  // Auto-join the creator as owner.
  await admin
    .from("community_members")
    .insert({ community_id: (created as { id: string }).id, user_id: userId, role: "owner" })
    .then(undefined, () => {});

  return { ok: true, slug };
}

/** Set a member's role (member ↔ mod). Community owner only. */
/** A member's role in a community (null when not a member). */
export async function getMemberRole(userId: string, communityId: string): Promise<string | null> {
  if (!userId || !communityId) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

/**
 * Can this user manage the community PAGE (customize, banner, links, members)?
 * The owner always can; an `admin` member can too. `mod` cannot (mods manage
 * crews/chat only). Used to gate every page-management action, server-side.
 */
export async function canManageCommunity(userId: string, communityId: string): Promise<boolean> {
  if (!userId || !communityId) return false;
  const community = await getCommunityById(communityId);
  if (!community) return false;
  if (community.ownerUserId === userId) return true;
  return (await getMemberRole(userId, communityId)) === "admin";
}

/**
 * Set a member's role. Permission hierarchy:
 *   - owner → can set any target to member / mod / admin
 *   - admin → can set targets to member / mod only (can't grant/revoke admin,
 *     can't touch the owner or other admins)
 * The owner's role is never changeable here.
 */
export async function setMemberRole(
  actorId: string,
  communityId: string,
  targetUserId: string,
  role: "member" | "mod" | "admin",
): Promise<{ ok: boolean; reason?: string }> {
  if (!actorId || !communityId || !targetUserId) return { ok: false, reason: "invalid_args" };
  if (role !== "member" && role !== "mod" && role !== "admin") return { ok: false, reason: "invalid_role" };
  const community = await getCommunityById(communityId);
  if (!community) return { ok: false, reason: "not_found" };
  if (targetUserId === community.ownerUserId) return { ok: false, reason: "cannot_change_owner" };

  const isOwner = community.ownerUserId === actorId;
  const actorRole = isOwner ? "owner" : await getMemberRole(actorId, communityId);
  const canManage = isOwner || actorRole === "admin";
  if (!canManage) return { ok: false, reason: "forbidden" };

  // Only the owner may grant admin, or change someone who is already an admin.
  const targetRole = await getMemberRole(targetUserId, communityId);
  if (!isOwner && (role === "admin" || targetRole === "admin")) {
    return { ok: false, reason: "forbidden" };
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("community_members")
    .update({ role })
    .eq("community_id", communityId)
    .eq("user_id", targetUserId)
    .neq("role", "owner");
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * Remove a member. Owner or admin may remove; an admin can't remove the owner
 * or another admin (only the owner can). Never removes the owner.
 */
export async function removeMember(
  actorId: string,
  communityId: string,
  targetUserId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actorId || !communityId || !targetUserId) return { ok: false, reason: "invalid_args" };
  const community = await getCommunityById(communityId);
  if (!community) return { ok: false, reason: "not_found" };
  if (targetUserId === community.ownerUserId) return { ok: false, reason: "cannot_remove_owner" };

  const isOwner = community.ownerUserId === actorId;
  const actorRole = isOwner ? "owner" : await getMemberRole(actorId, communityId);
  if (!isOwner && actorRole !== "admin") return { ok: false, reason: "forbidden" };
  // An admin can't remove another admin — only the owner can.
  if (!isOwner && (await getMemberRole(targetUserId, communityId)) === "admin") {
    return { ok: false, reason: "forbidden" };
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", targetUserId)
    .neq("role", "owner");
  return error ? { ok: false, reason: error.message } : { ok: true };
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

export interface OrganizableCommunity { id: string; slug: string; displayName: string | null }

/**
 * Communities a user may present an event under — ones they OWN (owner_user_id)
 * or manage as owner/mod (community_members). Powers the "Organized by" picker
 * on tournaments + board-game nights. Guarded: returns [] if the community
 * tables aren't there yet. De-duped by id.
 */
export async function listOrganizableCommunities(userId: string): Promise<OrganizableCommunity[]> {
  if (!userId) return [];
  const admin = createServiceClient();
  try {
    const byId = new Map<string, OrganizableCommunity>();
    // Owned outright (group communities created by the user; channel communities
    // once owner_user_id is backfilled).
    const { data: owned } = await admin
      .from("gs_communities")
      .select("id, slug, display_name")
      .eq("owner_user_id", userId);
    for (const c of (owned ?? []) as { id: string; slug: string; display_name: string | null }[]) {
      byId.set(c.id, { id: c.id, slug: c.slug, displayName: c.display_name });
    }
    // Managed via membership (owner/mod role).
    const { data: memberships } = await admin
      .from("community_members")
      .select("community_id, role, gs_communities(id, slug, display_name)")
      .eq("user_id", userId)
      .in("role", ["owner", "mod"]);
    for (const m of (memberships ?? []) as unknown as { gs_communities: { id: string; slug: string; display_name: string | null } | { id: string; slug: string; display_name: string | null }[] | null }[]) {
      const c = Array.isArray(m.gs_communities) ? m.gs_communities[0] : m.gs_communities;
      if (c && !byId.has(c.id)) byId.set(c.id, { id: c.id, slug: c.slug, displayName: c.display_name });
    }
    return [...byId.values()].sort((a, b) => (a.displayName ?? a.slug).localeCompare(b.displayName ?? b.slug));
  } catch {
    return [];
  }
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
  if (community.ownerUserId !== userId && (await getMemberRole(userId, communityId)) !== "admin") return { ok: false, reason: "forbidden" };

  const clean = sanitizeCommunityLinks(links);
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_communities")
    .update({ links: clean })
    .eq("id", communityId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, links: clean };
}

export interface CommunityCustomization {
  tagline: string | null;
  blurb: string | null;
  accent: string | null;
  bannerUrl: string | null;
  /** Section keys the owner has hidden. */
  hiddenSections: string[];
  /** A community post pinned to the top of the feed. */
  pinnedPostId: string | null;
}

/**
 * A community's owner-curated personalization (tagline / blurb / accent).
 * Resilient — returns all-null if the columns aren't there yet (migration
 * community-customization-m1 pending), mirroring `getCommunityLinks`.
 */
export async function getCommunityCustomization(communityId: string): Promise<CommunityCustomization> {
  const empty: CommunityCustomization = { tagline: null, blurb: null, accent: null, bannerUrl: null, hiddenSections: [], pinnedPostId: null };
  if (!communityId) return empty;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_communities")
    .select("tagline, blurb, accent, banner_url, hidden_sections, pinned_post_id")
    .eq("id", communityId)
    .maybeSingle();
  if (error || !data) return empty;
  const c = data as { tagline?: string | null; blurb?: string | null; accent?: string | null; banner_url?: string | null; hidden_sections?: string[] | null; pinned_post_id?: string | null };
  return {
    tagline: c.tagline ?? null,
    blurb: c.blurb ?? null,
    accent: c.accent ?? null,
    bannerUrl: c.banner_url ?? null,
    hiddenSections: Array.isArray(c.hidden_sections) ? c.hidden_sections.filter((k) => COMMUNITY_SECTION_KEYS.has(k)) : [],
    pinnedPostId: c.pinned_post_id ?? null,
  };
}

/** Update a community's personalization. Owner only. Returns the sanitized values. */
export async function updateCommunityCustomization(
  userId: string,
  communityId: string,
  fields: { tagline?: string | null; blurb?: string | null; accent?: string | null; hiddenSections?: string[]; pinnedPostId?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!userId || !communityId) return { ok: false, reason: "invalid_args" };
  const community = await getCommunityById(communityId);
  if (!community) return { ok: false, reason: "not_found" };
  if (community.ownerUserId !== userId && (await getMemberRole(userId, communityId)) !== "admin") return { ok: false, reason: "forbidden" };

  const hidden = Array.isArray(fields.hiddenSections)
    ? [...new Set(fields.hiddenSections.filter((k) => COMMUNITY_SECTION_KEYS.has(k)))]
    : [];
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_communities")
    .update({
      tagline: fields.tagline?.trim().slice(0, 120) || null,
      blurb: fields.blurb?.trim().slice(0, 500) || null,
      accent: fields.accent?.trim().slice(0, 40) || null,
      hidden_sections: hidden,
      pinned_post_id: fields.pinnedPostId?.trim() || null,
    })
    .eq("id", communityId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * A community's skin (background/card) + custom CSS, fetched SEPARATELY from the
 * other customization so a partial migration never blanks the rest. The skin is
 * resolved through the shared gate; the raw CSS is returned for the caller to
 * (re-)sanitize on render. Guarded → defaults when the columns aren't applied.
 */
export async function getCommunitySkinCss(communityId: string): Promise<{ skin: ProfileSkin; cssRaw: string | null }> {
  if (!communityId) return { skin: DEFAULT_PROFILE_SKIN, cssRaw: null };
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_communities")
    .select("customize_skin, customize_css")
    .eq("id", communityId)
    .maybeSingle();
  if (error || !data) return { skin: DEFAULT_PROFILE_SKIN, cssRaw: null };
  const row = data as { customize_skin?: unknown; customize_css?: string | null };
  return { skin: resolveProfileSkin(row.customize_skin), cssRaw: row.customize_css ?? null };
}

/**
 * Save a community's skin + (already-sanitized) custom CSS. Owner only. Guarded
 * so it no-ops before the community-skin-css migration is applied.
 */
export async function updateCommunitySkinCss(
  userId: string,
  communityId: string,
  skin: ProfileSkin,
  sanitizedCss: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!userId || !communityId) return { ok: false, reason: "invalid_args" };
  const community = await getCommunityById(communityId);
  if (!community) return { ok: false, reason: "not_found" };
  if (community.ownerUserId !== userId && (await getMemberRole(userId, communityId)) !== "admin") return { ok: false, reason: "forbidden" };
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_communities")
    .update({ customize_skin: skin, customize_css: sanitizedCss || null })
    .eq("id", communityId);
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * Set (or clear) a community's banner URL. Owner only. Returns the previous URL
 * so the caller can best-effort delete the old R2 object.
 */
export async function setCommunityBannerUrl(
  userId: string,
  communityId: string,
  url: string | null,
): Promise<{ ok: boolean; previousUrl?: string | null; reason?: string }> {
  if (!userId || !communityId) return { ok: false, reason: "invalid_args" };
  const community = await getCommunityById(communityId);
  if (!community) return { ok: false, reason: "not_found" };
  if (community.ownerUserId !== userId && (await getMemberRole(userId, communityId)) !== "admin") return { ok: false, reason: "forbidden" };

  const admin = createServiceClient();
  const { data: prev } = await admin
    .from("gs_communities")
    .select("banner_url")
    .eq("id", communityId)
    .maybeSingle();
  const previousUrl = (prev as { banner_url?: string | null } | null)?.banner_url ?? null;

  const { error } = await admin.from("gs_communities").update({ banner_url: url }).eq("id", communityId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, previousUrl };
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
