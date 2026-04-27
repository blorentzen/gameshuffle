/**
 * Staff impersonation — fake identity fixtures for UI chrome.
 *
 * When a staff member is impersonating a tier (or unauthenticated), the
 * navbar avatar, display name, and any other "this is who you are" chrome
 * should render the fake identity below — NOT the real staff member's
 * name and avatar. This keeps screen recordings, support shadowing, and
 * dogfooding sessions from leaking the real staff identity.
 *
 * **Important — display only.** This fixture has zero effect on:
 *   - `auth.uid()` and Supabase session identity
 *   - RLS policies (still gated on the real user_id)
 *   - Ownership checks in API routes
 *   - Database writes (sessions still belong to the real staff member)
 *
 * The fake identity is purely a chrome-layer substitution. Capability
 * resolution (separate, gs-pro-v1-architecture-addendum.md §16.6) is
 * what actually changes what the user is allowed to *do* under
 * impersonation. This fixture changes what the user *sees about
 * themselves*.
 *
 * Per gs-staff-tier-impersonation-spec.md follow-up.
 */

import type { AvatarSource } from "@/components/UserAvatar";
import type { SubscriptionTier } from "@/lib/subscription";

export interface ImpersonationDisplayIdentity {
  /** Replaces user.user_metadata.display_name in chrome. */
  displayName: string;
  /** A short string for `<UserAvatar />` to seed DiceBear off of. */
  avatarSeed: string;
  /** Avatar source. Always `'dicebear'` for fixtures — fake identities
   *  shouldn't pull a real Discord or Twitch profile image. */
  avatarSource: AvatarSource;
  /** Email shown in places that surface the address (e.g. settings header). */
  email: string;
}

const FREE_FIXTURE: ImpersonationDisplayIdentity = {
  displayName: "Free Demo User",
  avatarSeed: "gs-free-demo",
  avatarSource: "dicebear",
  email: "free-demo@example.com",
};

const PRO_FIXTURE: ImpersonationDisplayIdentity = {
  displayName: "Pro Demo User",
  avatarSeed: "gs-pro-demo",
  avatarSource: "dicebear",
  email: "pro-demo@example.com",
};

// Reserved for the eventual Pro+ tier. Mirroring the structure now means
// when Pro+ launches we just flip a constant — no fixture refactor needed.
const PRO_PLUS_FIXTURE: ImpersonationDisplayIdentity = {
  displayName: "Pro+ Demo User",
  avatarSeed: "gs-pro-plus-demo",
  avatarSource: "dicebear",
  email: "pro-plus-demo@example.com",
};

const FIXTURES: Record<SubscriptionTier | "pro_plus", ImpersonationDisplayIdentity> = {
  free: FREE_FIXTURE,
  pro: PRO_FIXTURE,
  pro_plus: PRO_PLUS_FIXTURE,
};

export type ImpersonationViewState =
  | { kind: "tier"; tier: SubscriptionTier | "pro_plus" }
  | { kind: "unauth" }
  | { kind: "default" };

/**
 * Resolve the display identity to render in chrome based on the current
 * impersonation state.
 *
 * Returns:
 *   - the fixture for the impersonated tier when viewing as a tier
 *   - `null` when viewing as unauth (chrome should render its
 *     logged-out variant — Log In button etc.)
 *   - `null` when not impersonating (chrome should render the real
 *     identity — the caller falls back to its normal data source)
 */
export function getImpersonationFixture(
  state: ImpersonationViewState
): ImpersonationDisplayIdentity | null {
  if (state.kind === "tier") return FIXTURES[state.tier] ?? null;
  // 'unauth' and 'default' both return null — caller decides whether
  // null means "render logged-out chrome" (unauth) or "render real
  // identity" (default). Use the original state if you need to
  // disambiguate.
  return null;
}
