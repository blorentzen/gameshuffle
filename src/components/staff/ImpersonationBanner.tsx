/**
 * Impersonation banner — server-rendered, persistent top banner for staff
 * users who are currently viewing GameShuffle as a different tier or as
 * unauthenticated.
 *
 * Visibility rules (gs-staff-tier-impersonation-spec.md §4.1):
 *   - Renders ONLY when the user is staff/admin AND at least one
 *     impersonation cookie is set.
 *   - Does NOT render in default state (staff with no cookies).
 *   - Does NOT render for non-staff users (their cookies are ignored at
 *     the auth layer, but defense in depth — we re-check the role here).
 *
 * Mounted from the root layout so it appears on first paint with no
 * flash of un-bannered content.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { shouldRenderImpersonationBanner } from "@/lib/capabilities/staff-impersonation";
import { ImpersonationExitButton } from "./ImpersonationExitButton";

export async function ImpersonationBanner() {
  // Resolve the real user — we need their role, not their impersonated tier.
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();
  if (!rawUser) return null;

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", rawUser.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  if (role !== "staff" && role !== "admin") return null;

  const banner = await shouldRenderImpersonationBanner({ role });
  if (!banner.show) return null;

  const label =
    banner.viewingAs === "unauth"
      ? "Unauthenticated"
      : banner.viewingAs === "pro"
        ? "Pro"
        : banner.viewingAs === "free"
          ? "Free"
          : "Custom";

  return (
    <div role="status" className="staff-impersonation-banner">
      <span className="staff-impersonation-banner__label">
        Viewing as <strong>{label}</strong>
      </span>
      <ImpersonationExitButton />
      <Link href="/account" className="staff-impersonation-banner__hint">
        (staff)
      </Link>
    </div>
  );
}
