import "server-only";

/**
 * Nudges and seats saved for friends (dailies + explore picks 2026-11-05, 3A and 6A).
 *
 * - A **nudge**: a friend who hasn't played a daily today gets one notice ("Kai solved today's Shuffle in 3 · Your
 *   turn: beat 1:12", or "Kai wants you on today's Dex" before Kai has played), with Play.
 * - A **seat**: the host of a night they just started tells a friend there's a seat for them, with Join.
 *
 * Friends only (you follow each other), never across a block, one nudge a day from you to each friend (whichever
 * daily) and one seat per night per friend. Muted with the "Nudges from friends" group in Settings.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { isBlocked } from "@/lib/moderation/blocks";
import { DAILIES, formatTime } from "@/lib/originals/dailies";
import type { BoardGame } from "@/lib/daily/boardRules";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";
import { nightGame } from "@/lib/nights/games";

export type NudgeError = "not_friends" | "blocked" | "already_played" | "already_nudged" | "unknown_game" | "not_host" | "already_invited";

const GAME_NAME: Record<BoardGame, string> = { shuffle: "Shuffle", dex: "Dex", fire: "Fire Round", duel: "Daily Duel" };

/** You follow each other. */
export async function areFriends(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const { data } = await createServiceClient().from("follows").select("follower_user_id, followee_user_id")
    .or(`and(follower_user_id.eq.${a},followee_user_id.eq.${b}),and(follower_user_id.eq.${b},followee_user_id.eq.${a})`).limit(2);
  return (data ?? []).length === 2;
}

async function nameOf(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username").eq("id", userId).maybeSingle();
  const r = data as { display_name: string | null; username: string | null } | null;
  return r?.display_name || r?.username || "A friend";
}

/** Nudge a friend about a daily (with your own result when you've played it). */
export async function sendDailyNudge(from: string, to: string, game: BoardGame): Promise<{ ok: true } | { ok: false; error: NudgeError }> {
  if (!(game in GAME_NAME)) return { ok: false, error: "unknown_game" };
  if (!(await areFriends(from, to))) return { ok: false, error: "not_friends" };
  if (await isBlocked(from, to)) return { ok: false, error: "blocked" };
  const db = createServiceClient();
  const day = gsDay();
  const [theirs, mine, sent] = await Promise.all([
    db.from("daily_scores").select("player").eq("game", game).eq("day", day).eq("player", `u:${to}`).limit(1),
    db.from("daily_scores").select("guesses, solved, seconds, score").eq("game", game).eq("day", day).eq("player", `u:${from}`).maybeSingle(),
    db.from("notifications").select("id").eq("type", "daily_nudge").eq("actor_user_id", from).eq("user_id", to)
      .gte("created_at", new Date(gsDayStart(day)).toISOString()).limit(1),
  ]);
  if (theirs.data?.length) return { ok: false, error: "already_played" };
  if (sent.data?.length) return { ok: false, error: "already_nudged" };
  const name = await nameOf(from);
  const label = GAME_NAME[game];
  const r = mine.data as { guesses: number; solved: boolean; seconds: number | null; score: number | null } | null;
  let title = `${name} wants you on today's ${label}`;
  let message = "Same puzzle for everyone. It's open until midnight Pacific.";
  if (r) {
    if (game === "fire") { title = `${name} scored ${(r.score ?? 0).toLocaleString("en-US")} on today's Fire Round`; message = "Your turn: beat it."; }
    else if (game === "duel") { title = r.solved ? `${name} won today's Daily Duel in ${r.guesses} turns` : `${name} played today's Daily Duel`; message = "Your turn: same six cards."; }
    else if (r.solved) { title = `${name} solved today's ${label} in ${r.guesses}`; message = r.seconds != null ? `Your turn: beat ${formatTime(r.seconds)}.` : "Your turn: do it in fewer."; }
    else { title = `${name} missed today's ${label}`; message = "Your turn: can you get it?"; }
  }
  await createNotification({ userId: to, type: "daily_nudge", title, message, actorUserId: from, link: DAILIES[game].href, data: { game, day } });
  return { ok: true };
}

/** The host of a night saves a friend a seat. */
export async function sendNightInvite(host: string, code: string, to: string): Promise<{ ok: true } | { ok: false; error: NudgeError }> {
  const db = createServiceClient();
  const { data: night } = await db.from("party_nights").select("id, host_user_id, game_slug, status, join_code").eq("join_code", code.toUpperCase()).maybeSingle();
  const n = night as { id: string; host_user_id: string; game_slug: string; status: string; join_code: string } | null;
  if (!n || n.host_user_id !== host || n.status !== "open") return { ok: false, error: "not_host" };
  if (!(await areFriends(host, to))) return { ok: false, error: "not_friends" };
  if (await isBlocked(host, to)) return { ok: false, error: "blocked" };
  const { data: sent } = await db.from("notifications").select("id").eq("type", "night_invite").eq("actor_user_id", host).eq("user_id", to)
    .contains("data", { code: n.join_code }).limit(1);
  if (sent?.length) return { ok: false, error: "already_invited" };
  const name = await nameOf(host);
  await createNotification({
    userId: to, type: "night_invite", title: `${name} started a ${nightGame(n.game_slug)?.label ?? "game"} night`,
    message: `There's a seat for you. Code ${n.join_code}.`, actorUserId: host, link: `/party/${n.join_code}`, data: { code: n.join_code },
  });
  return { ok: true };
}
