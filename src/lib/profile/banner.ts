import "server-only";

/**
 * A profile has one banner, and it's either a picture (JPG, PNG or WebP, cropped; users.profile_banner_url, with the
 * original kept for Reposition) or an animated GIF from the account's own GIFs (profile_banner_gifs,
 * src/lib/gifs/banner.ts). Never both: setting one clears the other (Britton, 2026-11-03: "it would either be an
 * image or animated GIF. We need to be particular about this").
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { deleteFromR2, isR2Configured, keyFromPublicUrl } from "@/lib/storage/r2";

export async function pictureBanner(userId: string): Promise<{ url: string | null; sourceUrl: string | null }> {
  const admin = createServiceClient();
  // Degrade to url-only if the m4 source column isn't applied yet.
  let res = await admin.from("users").select("profile_banner_url, profile_banner_source_url").eq("id", userId).maybeSingle();
  if (res.error) res = await admin.from("users").select("profile_banner_url").eq("id", userId).maybeSingle();
  const data = res.data as { profile_banner_url?: string | null; profile_banner_source_url?: string | null } | null;
  return { url: data?.profile_banner_url ?? null, sourceUrl: data?.profile_banner_source_url ?? null };
}

/** Removes the picture banner (and its stored files). */
export async function clearPictureBanner(userId: string): Promise<void> {
  const previous = await pictureBanner(userId);
  if (!previous.url && !previous.sourceUrl) return;
  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ profile_banner_url: null, profile_banner_source_url: null }).eq("id", userId);
  if (error) await admin.from("users").update({ profile_banner_url: null }).eq("id", userId);
  if (!isR2Configured()) return;
  for (const u of [previous.url, previous.sourceUrl]) {
    const k = u ? keyFromPublicUrl(u) : null;
    if (k) await deleteFromR2(k).catch(() => undefined);
  }
}
