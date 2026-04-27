/**
 * Capability check middleware for API routes.
 *
 * Pattern:
 *
 *   const denied = await requireCapability(req, 'session.create');
 *   if (denied) return denied;
 *   // ...continue handler
 *
 * The middleware resolves the current user from Supabase, applies staff
 * impersonation if cookies are set, and returns either a 401/403 Response
 * or `null` to indicate the request should proceed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  hasCapability,
  hasCapabilityAsync,
  normalizeTier,
  type Capability,
  type CapabilityUser,
  type SubscriptionTier,
} from "@/lib/subscription";
import { resolveStaffImpersonation } from "@/lib/capabilities/staff-impersonation";

export interface RequireCapabilityResult {
  /** Set when the request is allowed; null when denied. */
  user: ResolvedCapabilityUser | null;
  /** Set when the request is denied; null when allowed. */
  denial: NextResponse | null;
}

export interface ResolvedCapabilityUser extends CapabilityUser {
  id: string;
}

/**
 * Resolve the current user + impersonation state, then check the given
 * capability. Returns `{ user, denial: null }` on success and
 * `{ user: null, denial: <Response> }` on failure (401 unauthenticated,
 * 403 missing capability).
 *
 * `consultFeatureFlags: true` honors per-user overrides from the
 * `feature_flags` table (slower; defaults to false for hot paths).
 */
export async function requireCapability(
  capability: Capability,
  opts: { consultFeatureFlags?: boolean } = {}
): Promise<RequireCapabilityResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return {
      user: null,
      denial: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role")
    .eq("id", authUser.id)
    .maybeSingle();

  const role = (profile?.role as string | null) ?? null;
  const rawTier: SubscriptionTier = normalizeTier(
    (profile?.subscription_tier as string | null) ?? null
  );

  // Honor staff impersonation for staff/admin only.
  let viewingAsTier: SubscriptionTier | undefined;
  let viewingAsUnauth = false;
  if (role === "staff" || role === "admin") {
    const state = await resolveStaffImpersonation();
    viewingAsTier = state.viewingAsTier ?? undefined;
    viewingAsUnauth = state.viewingAsUnauth;
  }

  if (viewingAsUnauth) {
    return {
      user: null,
      denial: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  const capabilityUser: ResolvedCapabilityUser = {
    id: authUser.id,
    tier: rawTier,
    role,
    viewingAsTier,
  };

  const allowed = opts.consultFeatureFlags
    ? await hasCapabilityAsync(capabilityUser, capability, supabase)
    : hasCapability(capabilityUser, capability);

  if (!allowed) {
    return {
      user: null,
      denial: NextResponse.json(
        { error: "capability_required", capability },
        { status: 403 }
      ),
    };
  }

  return { user: capabilityUser, denial: null };
}
