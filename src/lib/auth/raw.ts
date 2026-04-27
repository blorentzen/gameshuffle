/**
 * Raw authentication helper — resolves the *real* user identity, bypassing
 * the staff impersonation cookie layer.
 *
 * Most server code goes through `requireCapability` (src/lib/capabilities/
 * middleware.ts), which honors the impersonation cookies for capability
 * resolution and "viewing as unauthenticated" overrides. But some surfaces
 * — staff-only tools, the impersonation API endpoint itself, audit logs —
 * need to know who the user *really* is, regardless of any view-as state.
 *
 * Per gs-dev-scenarios-spec.md §2.1: a staff user impersonating Free
 * should still be able to access /staff/scenarios. The impersonation is a
 * viewing layer, not a real role downgrade.
 *
 * Server-only. Never import from a client component.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export interface RawAuthenticatedUser {
  id: string;
  email: string | null;
  /** Real role from the `users.role` column. `null` for users with no row
   *  in `public.users` (shouldn't happen post-onboarding but treated as
   *  not-staff). */
  role: string | null;
}

/**
 * Resolve the current user via Supabase auth + look up their `users.role`.
 * Ignores any staff impersonation cookies. Returns `null` when the request
 * is unauthenticated.
 */
export async function getRawAuthenticatedUser(): Promise<RawAuthenticatedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as string | null) ?? null,
  };
}

/** Convenience: is the current request authenticated as staff (or admin)? */
export async function isStaffRequest(): Promise<boolean> {
  const user = await getRawAuthenticatedUser();
  return user?.role === "staff" || user?.role === "admin";
}
