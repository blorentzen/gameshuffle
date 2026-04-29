/**
 * Hub layout — gates every /hub/* route on capability `hub.access`.
 *
 * Per gs-pro-v1-phase-4a-spec.md §§2.2, 2.5:
 *   - Unauthenticated users redirect to /login?redirect_to=<original>
 *   - Free users redirect to /pricing
 *   - Pro+ users (and staff impersonating those tiers) pass the gate
 *
 * Per CDS inventory C.5 decision: Container chrome + Breadcrumbs (no
 * Sidebar in 4A — defer until Phase 4B has Templates/Settings/Help).
 *
 * Server component. Individual /hub/* routes don't re-check capability —
 * they trust the layout (DRY per spec §2.2).
 */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getStaffImpersonationState,
} from "@/lib/capabilities/staff-impersonation";
import {
  hasCapability,
  normalizeTier,
  type CapabilityUser,
} from "@/lib/subscription";

export default async function HubLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();

  // Honor staff impersonation: a staff member viewing-as-unauth gets the
  // unauth redirect; viewing-as-free gets the free redirect; regular Pro
  // staff defaults pass through (HIGHEST_TIER).
  const impersonation = await getStaffImpersonationState();
  if (!rawUser || impersonation.viewingAsUnauth) {
    // Login page reads ?redirect=<path>; round-trip to /hub at minimum.
    redirect("/login?redirect=/hub");
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

  return (
    <main className="hub-layout">
      <Container>{children}</Container>
    </main>
  );
}
