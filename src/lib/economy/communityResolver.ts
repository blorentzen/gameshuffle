/**
 * Resolve a streamer's `gs_communities` row starting from their
 * `users.id` (auth user id). Walks:
 *   users.id → gs_identities (platform='twitch') → gs_communities
 *
 * Mirrors the same lookup `getAllowanceForOwner` uses; lifted to a
 * shared helper so account-level surfaces (custom commands editor,
 * game-modules defaults editor, future settings UIs) don't each
 * re-implement the chain.
 *
 * Returns null when:
 *   - The user has no linked Twitch identity yet (hasn't connected
 *     streamer integration).
 *   - The identity exists but no community has been provisioned
 *     against it yet.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export async function resolveCommunityIdForOwner(
  ownerUserId: string,
): Promise<string | null> {
  const admin = createServiceClient();
  const { data: identityRow } = await admin
    .from("gs_identities")
    .select("id")
    .eq("gs_account_id", ownerUserId)
    .eq("platform", "twitch")
    .maybeSingle();
  if (!identityRow) return null;
  const { data: communityRow } = await admin
    .from("gs_communities")
    .select("id")
    .eq("owner_identity_id", (identityRow as { id: string }).id)
    .maybeSingle();
  if (!communityRow) return null;
  return (communityRow as { id: string }).id;
}
