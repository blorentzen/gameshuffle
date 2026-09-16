import "server-only";

/**
 * Owner personalization — the single source of truth for "this surface belongs
 * to a specific user / something they created, so wear their theme."
 *
 * Principle: GameShuffle stays brand-themed for platform surfaces (marketing,
 * the account app chrome, the /communities hub). Any surface ABOUT a user or
 * something they made — their profile (/u), their community (/c), their stream
 * (/live), tournaments they host, their overlay — cascades THEIR theme.
 *
 * Returns the CSS custom properties to spread onto that surface's root:
 *   • --brand-* (from their chosen brand-theme preset), and
 *   • --profile-accent (their personal accent), when set.
 * Both default cleanly (brand → the site brand; accent → absent), so an
 * un-themed owner looks exactly as before.
 */

import type { CSSProperties } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { brandCssVars, type BrandTheme } from "./brand";
import { getBrandThemeForOwner } from "./brand-server";
import { resolveAccent, resolveAccentOn } from "@/lib/profile/accents";

async function readAccent(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await createServiceClient()
      .from("users")
      .select("profile_accent")
      .eq("id", userId)
      .maybeSingle();
    return (data?.profile_accent as string | null) ?? null;
  } catch {
    return null; // column not migrated yet → no accent, brand only
  }
}

function withAccent(theme: BrandTheme, accentKey: string | null): CSSProperties {
  const vars = { ...brandCssVars(theme) } as Record<string, string>;
  const color = resolveAccent(accentKey);
  if (color) {
    vars["--profile-accent"] = color;
    const on = resolveAccentOn(accentKey);
    if (on) vars["--profile-accent-on"] = on;
  }
  return vars as CSSProperties;
}

/** Full personalization style for a user-owned surface, by owner user id. */
export async function getOwnerThemeVars(ownerUserId: string): Promise<CSSProperties> {
  const [theme, accent] = await Promise.all([
    getBrandThemeForOwner(ownerUserId),
    readAccent(ownerUserId),
  ]);
  return withAccent(theme, accent);
}
