/**
 * Twitch mods joining a streamer's GameShuffle mod team themselves (2026-10-10).
 * A mod types `!gs mod` in chat, opens /mod/join/<streamer>, signs in with
 * Twitch, and we check the channel's live Twitch mod list (Helix, the
 * streamer's `moderation:read` token). If they're on it they're in straight
 * away at the standard mod level (the lobby with kick, activity, decks);
 * the streamer can remove them in Streaming ▸ Setup ▸ Mods, and a mod the
 * streamer removed can't rejoin this way.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { listChannelModerators } from "@/lib/twitch/client";
import { getValidUserAccessToken } from "@/lib/twitch/userToken";

export interface JoinStreamer { id: string; slug: string; name: string }

export type JoinError = "self" | "no_twitch" | "not_a_mod" | "removed" | "twitch_unavailable" | "not_signed_in";

export const JOIN_ERRORS: Record<JoinError, string> = {
  self: "This is your own channel. You don't need to be your own mod.",
  no_twitch: "Sign in with the Twitch account you mod with. Connect Twitch in Settings ▸ Sign-in & security, then come back.",
  not_a_mod: "Your Twitch account isn't a mod in this channel. Ask the streamer to mod you on Twitch, then try again.",
  removed: "The streamer removed your mod access on GameShuffle. Ask them if you should be back in.",
  twitch_unavailable: "We couldn't check the channel's mods with Twitch just now. Try again in a minute.",
  not_signed_in: "Sign in first.",
};

/** The streamer for a join link: username first, then Twitch login (like /live). */
export async function joinStreamer(slug: string): Promise<JoinStreamer | null> {
  const admin = createServiceClient();
  const pick = "id, username, twitch_username, display_name";
  let { data } = await admin.from("users").select(pick).eq("username", slug.toLowerCase()).maybeSingle();
  if (!data) ({ data } = await admin.from("users").select(pick).eq("twitch_username", slug.toLowerCase()).maybeSingle());
  if (!data) return null;
  return { id: data.id as string, slug: (data.username as string | null) ?? (data.twitch_username as string), name: (data.display_name as string | null) ?? (data.username as string | null) ?? slug };
}

/** Whether this account is already an active mod for the streamer. */
export async function isActiveMod(streamerUserId: string, userId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("streamer_mods").select("id")
    .eq("streamer_user_id", streamerUserId).eq("gs_user_id", userId).eq("status", "active").maybeSingle();
  return !!data;
}

export async function joinAsMod(streamerUserId: string, userId: string): Promise<{ ok: true } | { ok: false; error: JoinError }> {
  if (streamerUserId === userId) return { ok: false, error: "self" };
  const admin = createServiceClient();
  const { data: me } = await admin.from("users").select("twitch_id, twitch_username, display_name").eq("id", userId).maybeSingle();
  const twitchId = (me?.twitch_id as string | null) ?? null;
  if (!twitchId) return { ok: false, error: "no_twitch" };

  const { data: conn } = await admin.from("twitch_connections").select("twitch_user_id").eq("user_id", streamerUserId).maybeSingle();
  const broadcasterId = (conn?.twitch_user_id as string | null) ?? null;
  if (!broadcasterId) return { ok: false, error: "twitch_unavailable" };

  let mods;
  try {
    const token = await getValidUserAccessToken(streamerUserId);
    mods = await listChannelModerators({ broadcasterId, accessToken: token });
  } catch (err) {
    console.error("[mods/join] Twitch mod list failed:", err);
    return { ok: false, error: "twitch_unavailable" };
  }
  const mod = mods.find((m) => m.user_id === twitchId);
  if (!mod) return { ok: false, error: "not_a_mod" };

  const now = new Date().toISOString();
  const name = mod.user_name || (me?.display_name as string | null) || (me?.twitch_username as string | null) || "Mod";
  const { data: existing } = await admin.from("streamer_mods").select("id, status, revoked_by_user_id")
    .eq("streamer_user_id", streamerUserId).eq("twitch_user_id", twitchId).maybeSingle();
  if (existing) {
    if (existing.status === "revoked" && existing.revoked_by_user_id) return { ok: false, error: "removed" };
    const { error } = await admin.from("streamer_mods").update({
      gs_user_id: userId, status: "active", claimed_at: now, invite_token: null, invite_expires_at: null, display_name: name, revoked_at: null,
    }).eq("id", existing.id);
    if (error) throw error;
    return { ok: true };
  }
  const { error } = await admin.from("streamer_mods").insert({
    streamer_user_id: streamerUserId, gs_user_id: userId, twitch_user_id: twitchId, display_name: name,
    status: "active", source: "twitch_auto_import", claimed_at: now,
  });
  if (error) throw error;
  return { ok: true };
}
