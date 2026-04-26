/**
 * Password-state helpers used across the set-password flow.
 *
 * Per gs-connections-architecture.md §5 — every account must have a
 * password set as the canonical sign-in fallback. OAuth-only signups get
 * forced through /signup/set-password before they can use the rest of
 * the app.
 *
 * Supabase doesn't expose `encrypted_password` to the client, but it
 * tracks every provider the user has authenticated through on
 * `auth.users.app_metadata.providers`. Password sign-in registers there
 * as `email` — that's our reliable "has password" signal.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Returns `true` when the user has a password set (i.e. `email` is in
 * `app_metadata.providers`). Service-role lookup — never call from a
 * client component.
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const providers = Array.isArray(data.user.app_metadata?.providers)
      ? (data.user.app_metadata!.providers as string[])
      : [];
    return providers.includes("email");
  } catch (err) {
    console.warn("[auth-password] userHasPassword lookup failed:", err);
    // Fail closed — if we can't tell, assume yes so the user isn't
    // gratuitously redirected. The runtime safety check on
    // /api/account/connections/disconnect still prevents lockout.
    return true;
  }
}
