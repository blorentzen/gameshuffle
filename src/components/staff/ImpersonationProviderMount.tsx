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
import { realStaffRole } from "@/lib/capabilities/realStaffRole";
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
  const role = await realStaffRole();
  if (!role) return { kind: "default" };

  const cookieState = await getStaffImpersonationState();
  if (cookieState.viewingAsUnauth) return { kind: "unauth" };
  if (cookieState.viewingAsTier) {
    return { kind: "tier", tier: cookieState.viewingAsTier };
  }
  return { kind: "default" };
}
