import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBlockState } from "@/lib/moderation/blocks";
import { effectiveTier, isStaffRole, normalizeTier } from "@/lib/subscription";

/**
 * `getProfileCard` — the single fetch behind the hover/tap profile card
 * (Spec 1 §4.2). Returns exactly the fields the card renders (a column
 * ALLOWLIST, never `select('*')`) plus the viewer's block relationship in the
 * SAME response, so the client never needs a second round trip to decide
 * whether to show a card.
 *
 * Service client so a viewer's RLS can't blank the target's public data — same
 * pattern as profile enrichment. Only allowlisted, already-public-surface
 * fields are returned; no email, no billing, no auth metadata.
 */

export interface ProfileCardData {
  userId: string;
  displayName: string;
  username: string | null;
  isPublic: boolean;
  /** Non-null when suspended/banned → the card renders a tombstone. */
  moderationStatus: string | null;

  // Avatar raw fields — rendered client-side via the shared avatar path so the
  // card matches every other avatar (DiceBear default / OAuth / custom).
  avatarSource: string | null;
  avatarSeed: string | null;
  avatarOptions: Record<string, unknown> | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;

  // Global badges (context-relative mod/host/VIP layer on later, per Phase 0).
  isStaff: boolean;
  isPro: boolean;
  isStreamer: boolean;
  isLive: boolean;

  /** Coarse presence fallback; live Realtime presence layers on top later. */
  isOnline: boolean;

  // Cheap stats only (§3.3) — member-since is free on the row; two head counts.
  memberSince: string | null;
  configCount: number;
  tournamentCount: number;

  // Viewer-relative.
  isSelf: boolean;
  blockedByViewer: boolean;
  blocksViewer: boolean;
}

export type ProfileCardResult =
  | { ok: true; card: ProfileCardData }
  | { ok: false; reason: "not_found" };

const ONLINE_MS = 5 * 60 * 1000;

export async function getProfileCard(
  viewerId: string | null,
  targetUserId: string,
): Promise<ProfileCardResult> {
  if (!targetUserId) return { ok: false, reason: "not_found" };
  const admin = createServiceClient();

  const { data: u } = await admin
    .from("users")
    .select(
      "id, display_name, username, is_public, moderation_status, created_at, role, subscription_tier, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, last_seen_at",
    )
    .eq("id", targetUserId)
    .maybeSingle();

  if (!u) return { ok: false, reason: "not_found" };

  const row = u as {
    id: string;
    display_name: string | null;
    username: string | null;
    is_public: boolean | null;
    moderation_status: string | null;
    created_at: string | null;
    role: string | null;
    subscription_tier: string | null;
    avatar_source: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    discord_avatar: string | null;
    twitch_avatar: string | null;
    last_seen_at: string | null;
  };

  const isSelf = !!viewerId && viewerId === targetUserId;

  const [configCountRes, tournamentCountRes, streamerRes, blockState] = await Promise.all([
    admin.from("saved_configs").select("id", { count: "exact", head: true }).eq("user_id", targetUserId),
    admin
      .from("tournament_participants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId),
    admin.from("twitch_connections").select("id, is_live").eq("user_id", targetUserId).limit(1).maybeSingle(),
    viewerId && !isSelf
      ? getBlockState(viewerId, targetUserId)
      : Promise.resolve({ blockedByViewer: false, blocksViewer: false }),
  ]);

  const tier = effectiveTier({ tier: normalizeTier(row.subscription_tier), role: row.role });
  const lastSeen = row.last_seen_at;

  return {
    ok: true,
    card: {
      userId: row.id,
      displayName: row.display_name || row.username || "Player",
      username: row.username,
      isPublic: !!row.is_public,
      moderationStatus: row.moderation_status,
      avatarSource: row.avatar_source,
      avatarSeed: row.avatar_seed,
      avatarOptions: row.avatar_options,
      discordAvatar: row.discord_avatar,
      twitchAvatar: row.twitch_avatar,
      isStaff: isStaffRole(row.role),
      isPro: tier === "pro",
      isStreamer: !!streamerRes.data,
      isLive: !!(streamerRes.data as { is_live?: boolean } | null)?.is_live,
      isOnline: !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS,
      memberSince: row.created_at,
      configCount: configCountRes.count ?? 0,
      tournamentCount: tournamentCountRes.count ?? 0,
      isSelf,
      blockedByViewer: blockState.blockedByViewer,
      blocksViewer: blockState.blocksViewer,
    },
  };
}
