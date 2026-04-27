/**
 * Server component that resolves the current staff impersonation state
 * (real role + cookies) and seeds <ImpersonationProvider /> with it. This
 * lets every client component that consumes `useImpersonation()` start
 * from server-resolved state on first paint — no flash of real identity
 * before the chrome swaps to the fixture.
 *
 * Non-staff users get the default (no-impersonation) state regardless
 * of any cookies present (cookies on a non-staff session are ignored
 * upstream by `resolveStaffImpersonationFor`).
 */

import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";
import type { ImpersonationViewState } from "@/lib/capabilities/impersonation-fixtures";
import { ImpersonationProvider } from "./ImpersonationContext";

export async function ImpersonationProviderMount({
  children,
}: {
  children: ReactNode;
}) {
  const state = await resolveServerState();
  return <ImpersonationProvider state={state}>{children}</ImpersonationProvider>;
}

async function resolveServerState(): Promise<ImpersonationViewState> {
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();
  if (!rawUser) return { kind: "default" };

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", rawUser.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  if (role !== "staff" && role !== "admin") return { kind: "default" };

  const cookieState = await getStaffImpersonationState();
  if (cookieState.viewingAsUnauth) return { kind: "unauth" };
  if (cookieState.viewingAsTier) {
    return { kind: "tier", tier: cookieState.viewingAsTier };
  }
  return { kind: "default" };
}
