import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { isProUser } from "@/lib/subscription-server";

/** The signed-in streamer running Stream Bingo from the dashboard. */
export type BingoOwner =
  | { error: string; status: number }
  | { userId: string; isPro: boolean; communityId: string | null };

export async function bingoOwner(): Promise<BingoOwner> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated", status: 401 };
  const [isPro, communityId] = await Promise.all([isProUser(user.id), resolveCommunityIdForOwner(user.id)]);
  return { userId: user.id, isPro, communityId };
}

/** Signed-in viewer (any account) with the name we'd announce them by. */
export async function bingoViewer(): Promise<{ userId: string; name: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("display_name, username, twitch_username").eq("id", user.id).maybeSingle();
  const p = data as { display_name: string | null; username: string | null; twitch_username: string | null } | null;
  return { userId: user.id, name: p?.display_name || p?.twitch_username || p?.username || "A viewer" };
}
