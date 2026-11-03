/**
 * Resolve a streamer's `gs_communities` row starting from their `users.id`.
 *
 * This used to walk exactly one path — users.id → gs_identities(platform
 * 'twitch') → gs_communities.owner_identity_id — which quietly failed for any
 * community NOT keyed on the Twitch identity. An account can hold several
 * identities (an `account` one plus `twitch`), and a community created from the
 * account side is owned by the `account` identity. The lookup then found
 * nothing, the API returned 404 `no_community`, and every gated tab told a
 * streamer with Twitch plainly connected to "Connect Twitch".
 *
 * So it now tries, in order of authority:
 *   1. `owner_user_id` — the direct link, set on modern rows.
 *   2. ANY of the user's identities via `owner_identity_id`, preferring the
 *      Twitch-owned row when there is more than one, since that is the channel
 *      community the economy surfaces mean.
 *
 * Returns null only when the user genuinely owns no community.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Hot callers (the OBS overlay every 2 seconds, chat commands) resolve the same owner over and over,
 * and each lookup also ran ensureOwnerMembership's write. A found community is kept per server
 * instance for five minutes and "none" for 30 seconds, so a community made a moment ago turns up.
 */
const FOUND_MS = 5 * 60_000;
const NONE_MS = 30_000;
const resolved = new Map<string, { at: number; id: Promise<string | null> }>();

export function resolveCommunityIdForOwner(ownerUserId: string): Promise<string | null> {
  const hit = resolved.get(ownerUserId);
  if (hit && Date.now() - hit.at < FOUND_MS) return hit.id;
  const id = lookUpCommunityIdForOwner(ownerUserId);
  resolved.set(ownerUserId, { at: Date.now(), id });
  if (resolved.size > 5_000) for (const [k, v] of resolved) if (Date.now() - v.at >= FOUND_MS) resolved.delete(k);
  // "None" and failures are kept briefly: back-date the entry so it lapses after NONE_MS.
  void id.then(
    (found) => { if (!found && resolved.get(ownerUserId)?.id === id) resolved.set(ownerUserId, { at: Date.now() - FOUND_MS + NONE_MS, id }); },
    () => { if (resolved.get(ownerUserId)?.id === id) resolved.delete(ownerUserId); },
  );
  return id;
}

/** Forget an owner's resolved community (after one is created or handed over). */
export function forgetCommunityForOwner(ownerUserId: string): void {
  resolved.delete(ownerUserId);
}

async function lookUpCommunityIdForOwner(
  ownerUserId: string,
): Promise<string | null> {
  const admin = createServiceClient();

  // 1. The direct link. Authoritative when present.
  const { data: direct } = await admin
    .from("gs_communities")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .limit(1)
    .maybeSingle();
  if (direct) {
    const id = (direct as { id: string }).id;
    await ensureOwnerMembership(id, ownerUserId);
    return id;
  }

  // 2. Legacy rows carry only `owner_identity_id`, and it may be any of the
  //    user's identities — not just Twitch.
  const { data: identities } = await admin
    .from("gs_identities")
    .select("id, platform")
    .eq("gs_account_id", ownerUserId);
  const rows = (identities ?? []) as { id: string; platform: string }[];
  if (rows.length === 0) return null;

  const { data: owned } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id")
    .in("owner_identity_id", rows.map((r) => r.id));
  const communities = (owned ?? []) as { id: string; owner_identity_id: string }[];
  if (communities.length === 0) return null;

  // Prefer the Twitch-identity community — that is the channel one.
  const twitchId = rows.find((r) => r.platform === "twitch")?.id;
  const chosen =
    communities.find((c) => c.owner_identity_id === twitchId) ?? communities[0];

  await ensureOwnerMembership(chosen.id, ownerUserId);
  return chosen.id;
}

/**
 * Make `ownerUserId` the owner of `communityId`: set `gs_communities.owner_user_id`
 * (if unset) and upsert a `community_members` row with role 'owner'. Best-effort
 * + guarded so it no-ops before the community-types / community-members
 * migrations are applied. Idempotent.
 */
const ensured = new Map<string, number>();
const ENSURED_MS = 10 * 60_000;

export async function ensureOwnerMembership(communityId: string, ownerUserId: string): Promise<void> {
  if (!communityId || !ownerUserId) return;
  // Done in this instance lately: skip the writes (it's idempotent, so a repeat changes nothing).
  const key = `${communityId}:${ownerUserId}`;
  if (Date.now() - (ensured.get(key) ?? 0) < ENSURED_MS) return;
  ensured.set(key, Date.now());
  if (ensured.size > 5_000) for (const [k, at] of ensured) if (Date.now() - at >= ENSURED_MS) ensured.delete(k);
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
