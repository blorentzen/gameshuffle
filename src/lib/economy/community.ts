/**
 * Community layer — Spec 01 §2.3.
 *
 * A `gs_communities` row exists 1:1 with a streamer (community owner).
 * Slug equals the streamer's `users.username` so `/live/[slug]`
 * resolves the community cleanly. It's the canonical scope key for
 * the token economy:
 *   - Per-community leaderboards filter `token_events` by `community_id`
 *   - The new-community bonus checks "first interaction with THIS
 *     community" against this id (Spec 01 §3.6 step 3)
 *   - Markets, prediction templates, and custom commands all scope
 *     to a community
 *
 * Community is distinct from `gs_streams` (one broadcast lifecycle)
 * and from `gs_sessions` (one play instance). Community = the
 * streamer's overall channel; streams + sessions belong to it.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface Community {
  id: string;
  owner_identity_id: string;
  slug: string;
  display_name: string | null;
  created_at: string;
}

/**
 * Upsert a community for a streamer. Called the first time a
 * streamer's identity becomes the host of an economy-relevant event
 * (going live, opening a market, etc.). Idempotent by both slug and
 * owner_identity_id — both have unique constraints.
 *
 * Slug should be the streamer's `users.username` (canonical) or
 * `twitch_username` as a fallback. Display name is opportunistic.
 */
export async function ensureCommunity(args: {
  ownerIdentityId: string;
  slug: string;
  displayName?: string | null;
}): Promise<Community> {
  if (!args.slug) {
    throw new Error("ensureCommunity: slug is required");
  }
  const admin = createServiceClient();

  // Try existing-by-owner first (1:1 means we don't need to chase
  // slug if the streamer is already known).
  let { data: existing } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id, slug, display_name, created_at")
    .eq("owner_identity_id", args.ownerIdentityId)
    .maybeSingle();
  // Fallback by slug — slug (= username) is the true 1:1 key. This matters when
  // the SAME streamer resolves under a DIFFERENT identity than the one that
  // created the community (e.g. a Twitch-created community now hit by a YouTube
  // chat command). Without it the insert below would 23505 on the slug and the
  // race re-read would throw.
  if (!existing) {
    const { data: bySlug } = await admin
      .from("gs_communities")
      .select("id, owner_identity_id, slug, display_name, created_at")
      .eq("slug", args.slug)
      .maybeSingle();
    existing = bySlug;
  }
  if (existing) {
    // Opportunistic display-name refresh on every contact so the
    // public /live/[slug] surface stays current as the streamer
    // changes their handle.
    if (args.displayName && args.displayName !== existing.display_name) {
      await admin
        .from("gs_communities")
        .update({ display_name: args.displayName })
        .eq("id", (existing as Community).id);
      (existing as Community).display_name = args.displayName;
    }
    return existing as Community;
  }

  // Insert; race-safe because both unique constraints catch
  // concurrent creation attempts (we re-read on conflict).
  const { data: inserted, error } = await admin
    .from("gs_communities")
    .insert({
      owner_identity_id: args.ownerIdentityId,
      slug: args.slug,
      display_name: args.displayName ?? null,
    })
    .select("id, owner_identity_id, slug, display_name, created_at")
    .maybeSingle();

  if (error && error.code !== "23505") {
    throw new Error(`ensureCommunity insert failed: ${error.message}`);
  }
  if (inserted) {
    // Brand-new community — seed two things, best-effort:
    //   1. Streamer-overridable custom-command defaults (Spec 03 §2.1):
    //      !socials, !discord, !youtube, !so, !uptime, !followage,
    //      !accountage.
    //   2. Module enablement defaults (Spec 06 §2): one row per
    //      catalog module with `default_enabled` applied. The
    //      dispatcher's module-enabled gate consults these rows.
    const community = inserted as Community;
    try {
      const [
        { seedDefaultsForCommunity: seedCustomCommands },
        { seedDefaultsForCommunity: seedModules },
      ] = await Promise.all([
        import("@/lib/twitch/commands/customCommands"),
        import("@/lib/economy/modules/registry"),
      ]);
      await Promise.all([
        seedCustomCommands(community.id),
        seedModules(community.id),
      ]);
    } catch (err) {
      console.error("[ensureCommunity] seed defaults failed", err);
    }
    // If the owning identity is already linked to a GS account, make that user
    // the community owner + member now (best-effort). Otherwise it self-heals
    // later via resolveCommunityIdForOwner once they've linked.
    try {
      const { data: idRow } = await admin
        .from("gs_identities")
        .select("gs_account_id")
        .eq("id", args.ownerIdentityId)
        .maybeSingle();
      const ownerUserId = (idRow as { gs_account_id: string | null } | null)?.gs_account_id ?? null;
      if (ownerUserId) {
        const { ensureOwnerMembership } = await import("@/lib/economy/communityResolver");
        await ensureOwnerMembership(community.id, ownerUserId);
      }
    } catch { /* best-effort */ }
    return community;
  }

  // Race-loss path: another caller created the row between our existence check
  // and our insert, OR the slug already belongs to a different owner identity
  // (same streamer, different platform identity). Re-read by owner then slug.
  const { data: settledByOwner } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id, slug, display_name, created_at")
    .eq("owner_identity_id", args.ownerIdentityId)
    .maybeSingle();
  if (settledByOwner) return settledByOwner as Community;
  const { data: settledBySlug } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id, slug, display_name, created_at")
    .eq("slug", args.slug)
    .single();
  return settledBySlug as Community;
}

/**
 * Public lookup for `/live/[slug]` and any other surface that needs
 * the community without authentication. Read-only — RLS allows
 * everyone to SELECT.
 */
export async function getCommunityBySlug(
  slug: string,
): Promise<Community | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id, slug, display_name, created_at")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Community | null) ?? null;
}

/** Direct id lookup — used by token helpers that already have a
 *  community_id and need the slug for rendering / chat replies. */
export async function getCommunityById(
  id: string,
): Promise<Community | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id, slug, display_name, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Community | null) ?? null;
}
