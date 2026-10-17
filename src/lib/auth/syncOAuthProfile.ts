import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { mergeIdentityAcrossSurfaces } from "@/lib/identity/merge";
import { ensureUsername } from "@/lib/social/usernameAssign";

/**
 * Copies a Twitch/Discord sign-in onto the account (`public.users`): the
 * provider ids, names and avatars, the gamertags, a display name when there
 * is none, a handle, and the cross-surface identity merge. Idempotent.
 *
 * Runs from /auth/callback and also from /api/account/ensure-username (once
 * per browser session), because Supabase only returns to our callback when
 * the return URL is on its redirect allowlist; otherwise it sends people to
 * the Site URL and the browser client signs them in on its own, skipping the
 * callback. Found 2026-10-16: most Twitch/Discord accounts since August had
 * no twitch_id/discord_id for that reason.
 */
/** What a provider sends about the person (Supabase `identity_data`). */
type IdentityData = { provider_id?: string; sub?: string; full_name?: string; name?: string; preferred_username?: string; avatar_url?: string; picture?: string; custom_claims?: { global_name?: string } };
type Gamertags = { discord?: string; twitch?: string; [k: string]: unknown };

export async function syncProfileFromOAuth(supabase: SupabaseClient, user: User): Promise<void> {
  const identities = user.identities || [];
  const discordIdentity = identities.find((i) => i.provider === "discord");
  const twitchIdentity = identities.find((i) => i.provider === "twitch");

  // Nothing to sync if no OAuth providers linked
  if (!discordIdentity && !twitchIdentity) return;

  const { data } = await supabase
    .from("users")
    .select("display_name, gamertags, discord_id, twitch_id")
    .eq("id", user.id)
    .single();
  const existing = data as { display_name: string | null; gamertags: Gamertags | null; discord_id: string | null; twitch_id: string | null } | null;

  const updates: Record<string, unknown> = {};
  const gamertags: Gamertags = { ...(existing?.gamertags || {}) };
  let displayName: string | null = null;
  let discordId: string | null = null, discordUsername: string | null = null;
  let twitchId: string | null = null, twitchUsername: string | null = null;

  // Set display name if not already set (prefer Discord, then Twitch)
  if (!existing?.display_name) {
    const meta = (discordIdentity?.identity_data || twitchIdentity?.identity_data || {}) as IdentityData;
    displayName = meta.full_name || meta.custom_claims?.global_name || meta.name || null;
    updates.display_name = displayName;
  }

  // Sync Discord
  if (discordIdentity) {
    const d = (discordIdentity.identity_data || {}) as IdentityData;
    discordId = d.provider_id || d.sub || discordIdentity.id || null;
    discordUsername = d.preferred_username || d.name || null;
    Object.assign(updates, { discord_id: discordId, discord_username: discordUsername, discord_avatar: d.avatar_url || null });
    if (discordUsername && !gamertags.discord) gamertags.discord = discordUsername;
  }

  // Sync Twitch
  if (twitchIdentity) {
    const t = (twitchIdentity.identity_data || {}) as IdentityData;
    twitchId = t.provider_id || t.sub || twitchIdentity.id || null;
    twitchUsername = t.preferred_username || t.name || null;
    Object.assign(updates, { twitch_id: twitchId, twitch_username: twitchUsername, twitch_avatar: t.avatar_url || t.picture || null });
    if (twitchUsername && !gamertags.twitch) gamertags.twitch = twitchUsername;
  }

  // Only update gamertags if we added something
  if (gamertags.discord || gamertags.twitch) {
    updates.gamertags = { ...(existing?.gamertags || {}), ...gamertags };
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("users").update(updates).eq("id", user.id);
    if (error) console.error("[oauth-sync] profile update failed:", error.message);
  }

  // Auto-assign a handle if they don't have one yet, so every account is
  // addressable + discoverable. No-op once a username exists.
  try {
    await ensureUsername(user.id, {
      discord: discordUsername,
      twitch: twitchUsername,
      displayName: displayName ?? existing?.display_name ?? null,
      email: user.email ?? null,
    });
  } catch (err) {
    console.error("[oauth-sync] username auto-assign failed:", err);
  }

  // Cross-surface identity merge — rebinds any ghost prequeue rows
  // and pending mod rows that were waiting for this Discord/Twitch
  // identity to surface. Idempotent + cheap, so we call it on every
  // OAuth callback (sign-in, sign-up, provider-link) without trying
  // to detect "is this the first time."
  try {
    // Use the freshly-synced id when available; fall back to the
    // existing column so a returning user with no provider-data change
    // still sweeps any ghost rows that landed since their last sign-in.
    await mergeIdentityAcrossSurfaces({
      gsUserId: user.id,
      discordUserId: discordId ?? existing?.discord_id ?? null,
      twitchUserId: twitchId ?? existing?.twitch_id ?? null,
    });
  } catch (err) {
    // Merge failure is non-fatal — the user lands successfully and
    // can re-trigger by signing out + back in. Logging only.
    console.error("[oauth-sync] identity merge failed:", err);
  }
}
