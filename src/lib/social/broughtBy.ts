import "server-only";

/**
 * Who brought someone to GameShuffle (bring-along picks 2026-11-05, all A): a new account's first days, from a link of
 * theirs. The new player sees "Kai brought you here" with Follow; Kai gets "Riley joined from your link" with Follow
 * back (following each other makes them friends). Set once (`users.brought_by_user_id`, supabase/brought-by-m1.sql);
 * never your own link, never someone you've blocked or who blocked you, only for accounts made in the last week.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { referrerFor } from "@/lib/referrals/store";
import { isBlocked } from "@/lib/moderation/blocks";
import { createNotification } from "@/lib/social/notifications";
import { catalogGame } from "@/data/game-catalog";

const NEW_ACCOUNT_MS = 7 * 86_400_000;

export interface Bringer {
  id: string;
  name: string;
  username: string;
  avatar: { id: string; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null };
  /** Up to three of their favorite games we have box art for (catalog names). */
  games: string[];
  following: boolean;
}

/** Records who brought `userId` (from a remembered profile/event/live link, or an invite code) and returns them for the card. */
export async function settleBroughtBy(userId: string, from: { userId?: string | null; code?: string | null }): Promise<Bringer | null> {
  const db = createServiceClient();
  const { data: me } = await db.from("users").select("id, display_name, username, created_at, brought_by_user_id").eq("id", userId).maybeSingle();
  const row = me as { display_name: string | null; username: string | null; created_at: string | null; brought_by_user_id: string | null } | null;
  if (!row) return null;
  let bringerId = row.brought_by_user_id;
  if (!bringerId) {
    const fresh = row.created_at && Date.now() - Date.parse(row.created_at) < NEW_ACCOUNT_MS;
    if (!fresh) return null;
    let candidate = typeof from.userId === "string" && /^[0-9a-f-]{36}$/i.test(from.userId) ? from.userId : null;
    if (!candidate && from.code) candidate = (await referrerFor(from.code).catch(() => null))?.userId ?? null;
    if (!candidate || candidate === userId) return null;
    if (await isBlocked(userId, candidate).catch(() => true)) return null;
    // Set once: a second tab or a reload never changes it.
    const { data: set } = await db.from("users").update({ brought_by_user_id: candidate, brought_by_at: new Date().toISOString() })
      .eq("id", userId).is("brought_by_user_id", null).select("id").maybeSingle();
    if (!set) return null;
    bringerId = candidate;
    const name = row.display_name || row.username || "Someone new";
    await createNotification({
      userId: candidate, type: "joined_from_link", actorUserId: userId,
      title: `${name} joined from your link`, message: "Follow back and you'll see each other's results.",
      link: row.username ? `/u/${row.username}` : null,
    }).catch(() => {});
  }
  const [{ data: them }, { data: follows }] = await Promise.all([
    db.from("users").select("id, display_name, username, is_public, favorite_games, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar").eq("id", bringerId).maybeSingle(),
    db.from("follows").select("followee_user_id").eq("follower_user_id", userId).eq("followee_user_id", bringerId),
  ]);
  const t = them as { id: string; display_name: string | null; username: string | null; is_public: boolean | null; favorite_games: string[] | null; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null } | null;
  if (!t?.username || t.is_public === false) return null;
  return {
    id: t.id, name: t.display_name || t.username, username: t.username,
    avatar: { id: t.id, avatar_source: t.avatar_source, avatar_seed: t.avatar_seed, avatar_options: t.avatar_options, twitch_avatar: t.twitch_avatar, discord_avatar: t.discord_avatar },
    games: (t.favorite_games ?? []).map((g) => catalogGame(g)?.name).filter((g): g is string => !!g).slice(0, 3),
    following: !!follows?.length,
  };
}
