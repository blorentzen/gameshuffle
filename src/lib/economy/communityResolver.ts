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
  const communityId = (communityRow as { id: string }).id;
  // Self-heal: a channel community is auto-created keyed on the streamer's
  // economy identity and historically never linked back to their GS user or
  // added them as a member. Since we got here from the OWNER's authed user id,
  // it's safe to backfill both now (idempotent, best-effort).
  await ensureOwnerMembership(communityId, ownerUserId);
  return communityId;
}

/**
 * Make `ownerUserId` the owner of `communityId`: set `gs_communities.owner_user_id`
 * (if unset) and upsert a `community_members` row with role 'owner'. Best-effort
 * + guarded so it no-ops before the community-types / community-members
 * migrations are applied. Idempotent.
 */
export async function ensureOwnerMembership(communityId: string, ownerUserId: string): Promise<void> {
  if (!communityId || !ownerUserId) return;
  const admin = createServiceClient();
  try {
    await admin
      .from("gs_communities")
      .update({ owner_user_id: ownerUserId })
      .eq("id", communityId)
      .is("owner_user_id", null);
  } catch { /* column not applied yet */ }
  try {
    const { data: existing } = await admin
      .from("community_members")
      .select("id, role")
      .eq("community_id", communityId)
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (!existing) {
      await admin.from("community_members").insert({ community_id: communityId, user_id: ownerUserId, role: "owner" });
    } else if ((existing as { role?: string }).role !== "owner") {
      await admin.from("community_members").update({ role: "owner" }).eq("id", (existing as { id: string }).id);
    }
  } catch { /* table not applied yet */ }
}
