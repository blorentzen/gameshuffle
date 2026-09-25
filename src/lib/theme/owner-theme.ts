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
import { getBrandTheme, DEFAULT_BRAND_THEME_ID } from "./brand";
import { getBrandThemeForOwner } from "./brand-server";
import { resolveAccent } from "@/lib/profile/accents";
import { visibleFill } from "./contrast";

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
    // Raw accent still drives the tint ramp, which mixes into the surface and is
    // therefore already mode-correct.
    vars["--profile-accent"] = color;

    // Solid fills are not. Measured against the shipped palette, amber, emerald
    // and cyan sat at 2.15, 2.54 and 2.43 against a white page — a button you
    // cannot pick out from the background. Derived per mode, same as the brand.
    const light = visibleFill(color, "#ffffff");
    const dark = visibleFill(color, "#0a0a0f");
    vars["--profile-accent-fill-light"] = light.fill;
    vars["--profile-accent-fill-dark"] = dark.fill;
    vars["--profile-accent-on-light"] = light.on;
    vars["--profile-accent-on-dark"] = dark.on;
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


/**
 * Theme for an EVENT surface — a tournament or a game night.
 *
 * An event inherits the person who runs it, until it says otherwise. Most
 * events are just "a thing this organizer is hosting" and should wear their
 * colours like their profile and community do. But an event can also be its
 * own brand — a league, a season, a one-off with a sponsor — so it gets an
 * override, which is what `eventTheme` is.
 *
 * Override, not blend. When an event names a theme it owns the whole identity
 * layer, INCLUDING dropping the organizer's personal accent: someone who
 * deliberately themed this event differently did not also ask for their own
 * accent colour on its buttons. Half-inheriting produces the muddle of one
 * person's accent on another identity's palette.
 *
 * `'default'` is not a choice, it is the absence of one, so it inherits.
 */
export async function getEventThemeVars(
  ownerUserId: string,
  eventTheme: string | null | undefined,
): Promise<CSSProperties> {
  if (eventTheme && eventTheme !== DEFAULT_BRAND_THEME_ID) {
    return brandCssVars(getBrandTheme(eventTheme));
  }
  return getOwnerThemeVars(ownerUserId);
}
