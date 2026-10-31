import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { isProUser } from "@/lib/subscription-server";
import { streamOwnerFor } from "@/lib/mods/acting";

/**
 * The streamer running a live game from the dashboard (Stream Bingo, Chat
 * Draft, Chat Brain): the signed-in account, or the streamer a Full-access
 * mod is acting for on their mod page (src/lib/mods/acting.ts). `userId`
 * and Pro are the streamer's; `actorUserId` is whoever is signed in.
 */
export type BingoOwner =
  | { error: string; status: number }
  | { userId: string; actorUserId: string; viaMod: boolean; isPro: boolean; communityId: string | null };

export async function bingoOwner(): Promise<BingoOwner> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated", status: 401 };
  const { ownerUserId, viaMod } = await streamOwnerFor(user.id);
  const [isPro, communityId] = await Promise.all([isProUser(ownerUserId), resolveCommunityIdForOwner(ownerUserId)]);
  return { userId: ownerUserId, actorUserId: user.id, viaMod, isPro, communityId };
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
