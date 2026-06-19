/**
 * Broadcaster channel-write helpers.
 *
 * Currently exposes `setBroadcasterCategory`, used by the announce-job
 * sweep to update a streamer's Twitch category to their session's
 * starting game when the announce_at moment elapses. Requires
 * `channel:manage:broadcast`, granted by Phase 4B+ streamers but
 * absent on legacy connections — callers should defer to
 * `hasAllCurrentScopes` and skip cleanly when the scope is missing.
 *
 * Affiliate / Partner status is NOT required for category updates
 * (unlike channel-point rewards), so the only failure mode aside from
 * scope is the broadcaster being offline (Twitch allows category sets
 * regardless of online status, so this is mostly informational).
 */

import { withUserTokenRetry } from "./userToken";
import { createTwitchAdminClient } from "./admin";

const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";

function clientId(): string {
  const id = process.env.TWITCH_CLIENT_ID;
  if (!id) throw new Error("TWITCH_CLIENT_ID env var is not set");
  return id;
}

/**
 * Resolve a randomizer slug (e.g. `mario-kart-world`) back to a Twitch
 * category id via the `twitch_game_categories` seed. Returns null if
 * we don't have a category mapping for the slug — the caller should
 * skip the category set in that case rather than guessing.
 */
export async function resolveTwitchCategoryIdForSlug(
  randomizerSlug: string
): Promise<string | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_game_categories")
    .select("twitch_category_id")
    .eq("randomizer_slug", randomizerSlug)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const row = data as { twitch_category_id: string | null } | null;
  return row?.twitch_category_id ?? null;
}

/**
 * Set the broadcaster's current Twitch category to the given game ID.
 * Returns true when Twitch accepted the change (HTTP 204), false when
 * Twitch returned a non-OK response (logged for diagnostics).
 *
 * Pre-conditions:
 *   - Connection has `channel:manage:broadcast` granted.
 *   - `broadcasterTwitchUserId` matches the connection's user.
 */
export async function setBroadcasterCategory(
  ownerUserId: string,
  broadcasterTwitchUserId: string,
  gameId: string
): Promise<boolean> {
  const body = JSON.stringify({ game_id: gameId });
  const result = await withUserTokenRetry(ownerUserId, async (token) => {
    return fetch(
      `${TWITCH_HELIX_BASE}/channels?broadcaster_id=${encodeURIComponent(
        broadcasterTwitchUserId
      )}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId(),
          "Content-Type": "application/json",
        },
        body,
      }
    );
  });
  if (!result.ok) {
    const text = await result.text().catch(() => "");
    console.error(
      `[twitch/broadcaster] setBroadcasterCategory failed: ${result.status} ${text}`
    );
    return false;
  }
  return true;
}
