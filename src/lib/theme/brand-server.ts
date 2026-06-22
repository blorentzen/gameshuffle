/**
 * Server-side brand-theme resolution. Kept separate from `brand.ts` (which
 * is client-safe) so DB/admin deps never leak into client bundles.
 *
 * Source of truth is `users.profile_theme` — a personal theme any user can
 * set (re-skins their public profile, and their stream surfaces if they
 * stream). For a streamer who set a community theme before personal themes
 * existed and hasn't re-saved, we fall back to `gs_communities.brand_theme`.
 * Always returns a BrandTheme — default when nothing is set.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { getBrandTheme, type BrandTheme } from "./brand";

export async function getBrandThemeForCommunityId(
  communityId: string,
): Promise<BrandTheme> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("brand_theme")
    .eq("id", communityId)
    .maybeSingle();
  return getBrandTheme((data?.brand_theme as string | null) ?? null);
}

export async function getBrandThemeForOwner(
  ownerUserId: string,
): Promise<BrandTheme> {
  const admin = createServiceClient();
  const { data: userRow } = await admin
    .from("users")
    .select("profile_theme")
    .eq("id", ownerUserId)
    .maybeSingle();
  const personal = (userRow?.profile_theme as string | null) ?? null;
  if (personal) return getBrandTheme(personal);

  // Legacy fallback: a community theme set before personal themes existed.
  const communityId = await resolveCommunityIdForOwner(ownerUserId);
  if (!communityId) return getBrandTheme(null);
  return getBrandThemeForCommunityId(communityId);
}
