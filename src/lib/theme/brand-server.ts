/**
 * Server-side brand-theme resolution. Kept separate from `brand.ts` (which
 * is client-safe) so DB/admin deps never leak into client bundles.
 *
 * Resolves a streamer's chosen brand theme from `gs_communities.brand_theme`,
 * either by their auth user id (the overlay path) or by community id (the
 * /live path, which already has the community). Always returns a BrandTheme —
 * falls back to the default when no community/theme is set.
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
  const communityId = await resolveCommunityIdForOwner(ownerUserId);
  if (!communityId) return getBrandTheme(null);
  return getBrandThemeForCommunityId(communityId);
}
