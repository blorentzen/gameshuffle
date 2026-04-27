/**
 * Staff tier impersonation — server-side cookie helpers.
 *
 * Per gs-pro-v1-architecture-addendum.md §16.6 and Phase 1 spec §4. Phase 1
 * ships these server-side mechanics. The UI control + visible banner ship
 * in Phase 1.5 (`gs-staff-tier-impersonation-spec.md`).
 *
 * Two cookies, both HTTP-only, samesite=lax, session-lifetime:
 *   - `gs_staff_view_as_tier`: 'free' | 'pro' | 'pro_plus'
 *     When set on a staff user, every `effectiveTier()` call resolves to
 *     this tier instead of `HIGHEST_TIER`.
 *   - `gs_staff_view_as_unauth`: 'true'
 *     When set on a staff user, server-side auth helpers treat the user
 *     as logged out.
 *
 * Cookie reads are no-ops for non-staff users — the impersonation only
 * applies after a staff role check has already passed. This keeps a
 * leaked / forged cookie from doing anything to a normal account.
 */

import { cookies } from "next/headers";
import type { SubscriptionTier } from "@/lib/subscription";

export const VIEW_AS_TIER_COOKIE = "gs_staff_view_as_tier";
export const VIEW_AS_UNAUTH_COOKIE = "gs_staff_view_as_unauth";

const VALID_TIERS: SubscriptionTier[] = ["free", "pro"];
// When Pro+ launches, append 'pro_plus' here.

export interface StaffImpersonationState {
  /** Tier the staff member is currently viewing as. `null` = no override. */
  viewingAsTier: SubscriptionTier | null;
  /** Whether the staff member is impersonating an unauthenticated visitor. */
  viewingAsUnauth: boolean;
}

const EMPTY_STATE: StaffImpersonationState = {
  viewingAsTier: null,
  viewingAsUnauth: false,
};

/**
 * Read the impersonation cookies without checking the user's role. Use
 * `resolveStaffImpersonation()` for the role-aware version that any
 * route can safely consume.
 */
export async function getStaffImpersonationState(): Promise<StaffImpersonationState> {
  const cookieStore = await cookies();
  const tierCookie = cookieStore.get(VIEW_AS_TIER_COOKIE)?.value;
  const unauthCookie = cookieStore.get(VIEW_AS_UNAUTH_COOKIE)?.value;

  const viewingAsTier =
    tierCookie && VALID_TIERS.includes(tierCookie as SubscriptionTier)
      ? (tierCookie as SubscriptionTier)
      : null;

  return {
    viewingAsTier,
    viewingAsUnauth: unauthCookie === "true",
  };
}

/**
 * Resolve impersonation state for the *current request*. Returns the empty
 * state if the request has no impersonation cookies set. Callers that
 * already know the user's role should use `resolveStaffImpersonationFor`
 * to avoid honoring the cookies on non-staff accounts.
 */
export async function resolveStaffImpersonation(): Promise<StaffImpersonationState> {
  return getStaffImpersonationState();
}

/**
 * Like `resolveStaffImpersonation()` but ignores the cookies if the user
 * is not staff/admin. This is the function route handlers should call
 * once they've identified the current user's role.
 */
export function resolveStaffImpersonationFor(
  role: string | null | undefined,
  raw: StaffImpersonationState
): StaffImpersonationState {
  if (role !== "staff" && role !== "admin") return EMPTY_STATE;
  return raw;
}

/**
 * Should the persistent impersonation banner render on this request? Only
 * yields `true` for staff users (cookies on a non-staff session are
 * ignored).
 */
export async function shouldRenderImpersonationBanner(args: {
  role: string | null | undefined;
}): Promise<{ show: boolean; viewingAs: "unauth" | SubscriptionTier | null }> {
  if (args.role !== "staff" && args.role !== "admin") {
    return { show: false, viewingAs: null };
  }
  const state = await getStaffImpersonationState();
  if (state.viewingAsUnauth) return { show: true, viewingAs: "unauth" };
  if (state.viewingAsTier) return { show: true, viewingAs: state.viewingAsTier };
  return { show: false, viewingAs: null };
}
