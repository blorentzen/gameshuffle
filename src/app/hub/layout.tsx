/**
 * Hub layout — provides the Container chrome for /hub/* routes.
 *
 * Phase 4B note: capability gating moved out of the layout into the
 * per-page helper `requireHubAccess()` so the public recap page at
 * /hub/sessions/[slug]/recap can live under /hub without inheriting
 * an auth redirect. Per gs-pro-v1-phase-4b-spec.md §6.1.
 *
 * Server component. Each /hub/* page that needs the gate calls
 * `requireHubAccess()` at the top of its function.
 */

import type { ReactNode } from "react";
import { Container } from "@empac/cascadeds";

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <main className="hub-layout">
      <Container>{children}</Container>
    </main>
  );
}
