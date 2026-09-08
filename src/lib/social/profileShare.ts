import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getIdentityByPlatform } from "@/lib/economy/identity";
import { SITE_URL } from "@/lib/seo";

/**
 * Profile sharing — the data behind "drop my GameShuffle profile in chat."
 * Resolves a platform caller (Twitch / Discord) to their shareable public
 * profile so the chat + Discord commands (and the web share button) all speak
 * the same shape. Nothing here renders — callers format for their surface.
 */

export interface ProfileShare {
  userId: string;
  username: string;
  displayName: string;
  /** Public + not suspended/banned — safe to share. */
  visible: boolean;
}

/** Canonical public profile URL for a handle. */
export function profileUrl(username: string): string {
  return `${SITE_URL}/u/${username}`;
}

/** Resolve a GS user id to a shareable profile, or null if they have no
 *  public handle. `visible` is false when the profile is private or withheld. */
export async function resolveProfileShareForUser(userId: string): Promise<ProfileShare | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("id, username, display_name, is_public, moderation_status")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.username) return null;
  const moderationOk = ["ok", "warned"].includes((data.moderation_status as string | null) ?? "ok");
  return {
    userId: data.id as string,
    username: data.username as string,
    displayName: (data.display_name as string | null) || (data.username as string),
    visible: !!data.is_public && moderationOk,
  };
}

/** Resolve a platform identity (twitch/discord) to a shareable profile.
 *  Returns null when the caller has no linked GS account at all. */
export async function resolveProfileShareForIdentity(
  platform: "twitch" | "discord",
  platformId: string,
): Promise<ProfileShare | null> {
  const identity = await getIdentityByPlatform(platform, platformId);
  if (!identity?.gs_account_id) return null;
  return resolveProfileShareForUser(identity.gs_account_id);
}
