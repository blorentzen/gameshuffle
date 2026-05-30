/**
 * Server-side region resolution — Spec 07 §6.
 *
 * Source priority (highest to lowest):
 *   1. Authenticated session locale — from Supabase Auth's
 *      `auth.users.identities[].identity_data.locale`. Twitch OAuth
 *      delivers this on consent; it's the most user-intent-aligned
 *      signal.
 *   2. CF-IPCountry / x-vercel-ip-country headers — Cloudflare and
 *      Vercel both stamp the viewer's country onto every request.
 *      Used as a fallback for unauthenticated or Twitch-pre-locale
 *      sessions.
 *   3. Null. The caller treats null as "unknown" and applies the
 *      Spec 07 §6 default: `prediction_pool` → spectator;
 *      `casino_style` → unavailable.
 *
 * ⚠️ NOT LEGAL ADVICE. The choice of source is a counsel question;
 * this module is the mechanism. Changing the source is a one-place
 * edit. Region codes follow ISO 3166-1 alpha-2 (two-letter); sub-
 * regions follow ISO 3166-2 hyphenated form (`CA-QC`). The
 * `gs_compliance_rules` table is keyed on this convention.
 */

import "server-only";
import type { User } from "@supabase/supabase-js";

export type RegionCode = string; // 'US' | 'CA-QC' | etc.

export interface RegionResolution {
  /** ISO 3166-1 / -2 code, or null when unresolvable. */
  region: RegionCode | null;
  /** Where the answer came from — drives the compliance gate's
   *  default-deny behavior and informs logging. */
  source: "session_locale" | "ip_header" | "unknown";
}

/**
 * Resolve the viewer's region from a web request. Used by
 * `/api/live/[slug]/bet` and any other web-side surface that gates
 * on region.
 *
 * Cloudflare's `cf-ipcountry` and Vercel's `x-vercel-ip-country`
 * stamp two-letter codes; we accept either header. Some Vercel
 * regions also stamp `x-vercel-ip-country-region` for the sub-
 * region (e.g. `QC`) — concatenate to form `CA-QC` when both
 * exist.
 */
export function resolveRegionFromRequest(args: {
  request: Request;
  user: User | null;
}): RegionResolution {
  // 1. Authenticated session locale (highest priority).
  const sessionRegion = regionFromUser(args.user);
  if (sessionRegion) {
    return { region: sessionRegion, source: "session_locale" };
  }
  // 2. IP-based header fallback.
  const headerRegion = regionFromHeaders(args.request.headers);
  if (headerRegion) {
    return { region: headerRegion, source: "ip_header" };
  }
  return { region: null, source: "unknown" };
}

/**
 * Resolve the region for a chat actor. Chat hits don't carry IP
 * headers or session cookies — the only signal is the viewer's
 * GS account (if linked) and its stored OAuth locale.
 *
 * Tier 0 chatters (no linked account) have no resolvable region.
 * Per Spec 07 §6, that's not a failure — it falls back to the
 * conservative default (spectator for prediction_pool).
 */
export async function resolveRegionForIdentity(
  gsAccountId: string | null,
): Promise<RegionResolution> {
  if (!gsAccountId) {
    return { region: null, source: "unknown" };
  }
  // Lazy-import to avoid pulling the admin client into modules that
  // resolve region from a request only.
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  // Supabase Auth stores identity_data as JSON; the Twitch identity
  // row carries `locale` populated by Twitch's OAuth handshake.
  const { data } = await admin.auth.admin.getUserById(gsAccountId);
  const user = data?.user ?? null;
  const region = regionFromUser(user);
  if (region) return { region, source: "session_locale" };
  return { region: null, source: "unknown" };
}

function regionFromUser(user: User | null): RegionCode | null {
  if (!user) return null;
  const identities = user.identities ?? [];
  for (const identity of identities) {
    const data = identity.identity_data as Record<string, unknown> | undefined;
    if (!data) continue;
    // Twitch's `locale` looks like 'en-US' / 'fr-CA' / 'pt-BR'. The
    // post-hyphen segment is the country. (`zh-Hans-CN` -> 'CN'.)
    const locale = (data.locale as string | undefined) ?? null;
    if (locale && typeof locale === "string") {
      const code = countryFromLocale(locale);
      if (code) return code;
    }
    // Discord includes `country` directly on some accounts (rare).
    const country = (data.country as string | undefined) ?? null;
    if (country && /^[A-Z]{2}$/.test(country)) return country;
  }
  return null;
}

function regionFromHeaders(headers: Headers): RegionCode | null {
  const cf = headers.get("cf-ipcountry");
  const vercel = headers.get("x-vercel-ip-country");
  const country = (cf ?? vercel ?? "").toUpperCase().trim();
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  // Vercel also exposes the sub-region for some countries.
  const subRegion =
    (headers.get("x-vercel-ip-country-region") ?? "").toUpperCase().trim() || null;
  if (subRegion && /^[A-Z0-9]+$/.test(subRegion)) {
    return `${country}-${subRegion}`;
  }
  return country;
}

function countryFromLocale(locale: string): string | null {
  // 'en-US' -> 'US', 'fr-CA' -> 'CA', 'zh-Hans-CN' -> 'CN'.
  // Anything without a two-letter trailing segment is unusable.
  const segments = locale.split(/[-_]/);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].toUpperCase();
    if (/^[A-Z]{2}$/.test(seg)) return seg;
  }
  return null;
}
