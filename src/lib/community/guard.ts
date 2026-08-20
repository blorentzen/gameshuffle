import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { COMMUNITY_PUBLICLY_ENABLED, canSeeCommunity } from "./flags";

/**
 * Server-side gate for community APIs while the feature is suppressed. Mirrors
 * the UI gate so the feed can't be driven directly through the API by non-staff
 * before launch. No-ops (no query) once the public flag is on.
 */
export async function userCanUseCommunity(userId: string): Promise<boolean> {
  if (COMMUNITY_PUBLICLY_ENABLED) return true;
  const { data } = await createServiceClient()
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return canSeeCommunity((data as { role: string | null } | null)?.role);
}
