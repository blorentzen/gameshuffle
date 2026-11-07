/**
 * Impersonation banner — server-rendered, persistent top banner for staff
 * users who are currently viewing GameShuffle as a different tier, as
 * unauthenticated, or as a persona (src/lib/preview), so a screenshot is
 * never mistaken for the real account.
 *
 * Visibility rules (gs-staff-tier-impersonation-spec.md §4.1):
 *   - Renders ONLY when the user is staff/admin AND at least one
 *     impersonation cookie is set.
 *   - Does NOT render in default state (staff with no cookies).
 *   - Does NOT render for non-staff users (their cookies are ignored at
 *     the auth layer, but defense in depth — we re-check the role here).
 * One exception, dev database only: a test persona account that a staff
 * member signed in as gets a strip with "Back to my account".
 *
 * Mounted from the root layout so it appears on first paint with no
 * flash of un-bannered content.
 */

import { cookies } from "next/headers";
import { realStaffRole } from "@/lib/capabilities/realStaffRole";
import { shouldRenderImpersonationBanner } from "@/lib/capabilities/staff-impersonation";
import { createClient } from "@/lib/supabase/server";
import { personaLine } from "@/lib/preview/persona";
import { DEV_RETURN_COOKIE, personaPreview, readReturn } from "@/lib/preview/server";
import { devAccountsOn, devPersonaByEmail } from "@/lib/preview/devAccounts";
import { ImpersonationExitButton } from "./ImpersonationExitButton";

export async function ImpersonationBanner() {
  // Resolve the real user — we need their role, not their impersonated tier.
  const role = await realStaffRole();
  if (!role) return <TestAccountStrip />;

  const persona = await personaPreview();
  if (persona) {
    return (
      <div role="status" className="staff-impersonation-banner">
        <span className="staff-impersonation-banner__label">
          Previewing a persona: <strong>{personaLine(persona)}</strong>
        </span>
        <ImpersonationExitButton />
      </div>
    );
  }

  const banner = await shouldRenderImpersonationBanner({ role });
  if (!banner.show) return null;

  const label =
    banner.viewingAs === "unauth"
      ? "Visitor"
      : banner.viewingAs === "pro"
        ? "GS Pro"
        : banner.viewingAs === "free"
          ? "Free"
          : "Custom";

  return (
    <div role="status" className="staff-impersonation-banner">
      <span className="staff-impersonation-banner__label">
        Viewing as <strong>{label}</strong>
      </span>
      <ImpersonationExitButton />
    </div>
  );
}

/** Dev only: signed in as a test persona account from a staff account. */
async function TestAccountStrip() {
  if (!devAccountsOn()) return null;
  const back = readReturn((await cookies()).get(DEV_RETURN_COOKIE)?.value);
  if (!back) return null;
  const { data: { user } } = await (await createClient()).auth.getUser();
  const persona = devPersonaByEmail(user?.email);
  if (!persona) return null;
  return (
    <div role="status" className="staff-impersonation-banner">
      <span className="staff-impersonation-banner__label">
        Test account: <strong>{persona.name}</strong>, {persona.line}
      </span>
      <ImpersonationExitButton back />
    </div>
  );
}
