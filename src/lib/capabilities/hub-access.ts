/**
 * Hub-access gate — promoted from /hub/layout.tsx into a per-page helper
 * so the public recap page (/hub/sessions/[slug]/recap) can opt out of
 * the gate while still living under the /hub URL space per
 * gs-pro-v1-phase-4b-spec.md §6.1.
 *
 * Pages that need the gate import + call this at the top. The function
 * either returns the authorized user context or redirects (and never
 * returns).
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";
import {
  hasCapability,
  normalizeTier,
  type CapabilityUser,
} from "@/lib/subscription";

export interface HubAccessContext {
  userId: string;
  capabilityUser: CapabilityUser;
}

export async function requireHubAccess(
  redirectPath: string = "/hub"
): Promise<HubAccessContext> {
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();

  const impersonation = await getStaffImpersonationState();
  if (!rawUser || impersonation.viewingAsUnauth) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", rawUser.id)
    .maybeSingle();

  const role = (profile?.role as string | null) ?? null;
  const rawTier = normalizeTier(
    (profile?.subscription_tier as string | null) ?? null
  );

  const capabilityUser: CapabilityUser = {
    tier: rawTier,
    role,
    viewingAsTier:
      role === "staff" || role === "admin"
        ? impersonation.viewingAsTier ?? undefined
        : undefined,
  };

  if (!hasCapability(capabilityUser, "hub.access")) {
    redirect("/pricing");
  }

  return { userId: rawUser.id, capabilityUser };
}
