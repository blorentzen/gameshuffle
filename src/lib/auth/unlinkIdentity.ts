import "server-only";

/**
 * Removes one sign-in identity from the signed-in account (the Connections card's Disconnect). Callers check first that
 * a way back in remains (a password or another provider).
 *
 *   1. Supabase's own unlink, with the person's session: works whenever the account has another identity.
 *   2. Otherwise `gs_unlink_identity` (supabase/unlink-identity-m1.sql), for the case Supabase refuses: an account's
 *      last identity when it has a password. The database API never exposes the auth schema (PGRST106), which is
 *      why the old direct delete always failed.
 */

import type { SupabaseClient, UserIdentity } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";

export type UnlinkResult = "ok" | "not_ready" | "failed";

export async function unlinkIdentity(session: SupabaseClient, userId: string, identity: Pick<UserIdentity, "id" | "identity_id" | "provider">): Promise<UnlinkResult> {
  const { data: mine } = await session.auth.getUserIdentities();
  const own = mine?.identities.find((i) => i.identity_id === identity.identity_id || i.id === identity.id);
  if (own) {
    const { error } = await session.auth.unlinkIdentity(own);
    if (!error) return "ok";
    // single_identity_not_deletable (the last identity) or a session that needs its second step: try the function.
    console.warn("[auth/unlink] Supabase refused, using the function:", error.code ?? error.message);
  }
  const { data, error } = await createServiceClient().rpc("gs_unlink_identity", { p_user: userId, p_identity: identity.identity_id });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") { console.error("[auth/unlink] gs_unlink_identity is missing: run supabase/unlink-identity-m1.sql"); return "not_ready"; }
    console.error("[auth/unlink] function failed:", error);
    return "failed";
  }
  return data === true ? "ok" : "failed";
}
