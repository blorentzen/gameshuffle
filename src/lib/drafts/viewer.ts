import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";

/** The signed-in viewer on /live, with their linked Twitch id (how captains are recognized). */
export async function draftViewer(): Promise<{ userId: string; twitchId: string | null } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("twitch_id").eq("id", user.id).maybeSingle();
  return { userId: user.id, twitchId: (data as { twitch_id: string | null } | null)?.twitch_id ?? null };
}

/** Is this viewer the streamer who owns the community? */
export async function ownsCommunity(userId: string, communityId: string): Promise<boolean> {
  return (await resolveCommunityIdForOwner(userId).catch(() => null)) === communityId;
}
