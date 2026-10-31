/**
 * Password-state helpers used across the set-password flow.
 *
 * Per gs-connections-architecture.md §5 — every account must have a
 * password set as the canonical sign-in fallback. OAuth-only signups get
 * forced through /signup/set-password before they can use the rest of
 * the app.
 *
 * `app_metadata.has_password` is the signal, kept by a trigger on
 * auth.users (supabase/auth-has-password-m1.sql). Until that runs we fall
 * back to `app_metadata.providers` containing `email`, which misses a
 * Twitch/Discord account that saved a password (Supabase only adds `email`
 * there after an email sign-in).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { passwordFlag } from "@/lib/auth/passwordRules";

/**
 * Returns `true` when the user has a password set. Service-role lookup,
 * never call from a client component.
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const providers = Array.isArray(data.user.app_metadata?.providers)
      ? (data.user.app_metadata!.providers as string[])
      : [];
    return passwordFlag(data.user.app_metadata) ?? providers.includes("email");
  } catch (err) {
    console.warn("[auth-password] userHasPassword lookup failed:", err);
    // Fail closed — if we can't tell, assume yes so the user isn't
    // gratuitously redirected. The runtime safety check on
    // /api/account/connections/disconnect still prevents lockout.
    return true;
  }
}
