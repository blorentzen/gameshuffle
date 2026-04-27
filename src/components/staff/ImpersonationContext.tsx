"use client";

/**
 * Client-side context exposing the staff impersonation view state. Seeded
 * server-side via <ImpersonationProviderMount /> so first paint matches
 * the server's resolution of the impersonation cookies — no flash of
 * real identity before chrome swaps to the fixture.
 *
 * The state never mutates client-side. The only way to change it is via
 * POST /api/staff/impersonate, which then reloads the page (re-runs the
 * server-side mount with fresh cookies). That's why the context just
 * carries a static value, not a setter.
 *
 * Per gs-staff-tier-impersonation-spec.md follow-up.
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  getImpersonationFixture,
  type ImpersonationDisplayIdentity,
  type ImpersonationViewState,
} from "@/lib/capabilities/impersonation-fixtures";

interface ImpersonationContextValue {
  /** Current view state. `default` = real identity. */
  state: ImpersonationViewState;
  /** Convenience flag: should chrome show fake/no identity? */
  isImpersonating: boolean;
  /** Convenience flag: are we pretending to be logged out? */
  isViewingAsUnauth: boolean;
  /** Fixture identity to render, or null when chrome should fall back
   *  to the real user (default state) or render logged-out chrome
   *  (unauth state). */
  fixture: ImpersonationDisplayIdentity | null;
}

const DEFAULT_VALUE: ImpersonationContextValue = {
  state: { kind: "default" },
  isImpersonating: false,
  isViewingAsUnauth: false,
  fixture: null,
};

const ImpersonationContext =
  createContext<ImpersonationContextValue>(DEFAULT_VALUE);

export function ImpersonationProvider({
  state,
  children,
}: {
  state: ImpersonationViewState;
  children: ReactNode;
}) {
  const value: ImpersonationContextValue = {
    state,
    isImpersonating: state.kind !== "default",
    isViewingAsUnauth: state.kind === "unauth",
    fixture: getImpersonationFixture(state),
  };
  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation(): ImpersonationContextValue {
  return useContext(ImpersonationContext);
}
