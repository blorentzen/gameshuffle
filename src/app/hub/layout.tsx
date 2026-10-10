/**
 * Hub layout: the Container chrome for /hub/* routes.
 *
 * Capability gating lives in the per-page `requireHubAccess()` so the
 * public recap page at /hub/sessions/[slug]/recap can live under /hub
 * without inheriting an auth redirect. The token allowance chip moved
 * into the hub home's header (2026-10-10); it used to float above every
 * hub page on its own.
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
