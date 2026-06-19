/**
 * Hub layout — provides the Container chrome for /hub/* routes.
 *
 * Phase 4B note: capability gating moved out of the layout into the
 * per-page helper `requireHubAccess()` so the public recap page at
 * /hub/sessions/[slug]/recap can live under /hub without inheriting
 * an auth redirect. Per gs-pro-v1-phase-4b-spec.md §6.1.
 *
 * The chrome includes a thin top strip with the streamer's current
 * monthly token allowance — that number anchors every disbursement
 * decision (awards, bounty payouts, market resolutions), so it lives
 * one click away on every hub surface.
 *
 * Server component. Each /hub/* page that needs the gate calls
 * `requireHubAccess()` at the top of its function.
 */

import type { ReactNode } from "react";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { TokenAllowanceBadge } from "@/components/hub/TokenAllowanceBadge";

export default async function HubLayout({ children }: { children: ReactNode }) {
  // Best-effort: read the authenticated user so we can show the
  // allowance pill. On public surfaces (recap) this returns null and
  // the badge renders nothing.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="hub-layout">
      <Container>
        {user && (
          <div className="hub-layout__chrome">
            <TokenAllowanceBadge ownerUserId={user.id} />
          </div>
        )}
        {children}
      </Container>
    </main>
  );
}
