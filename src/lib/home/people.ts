import "server-only";

/**
 * "Your people" on the signed-in home (room picks 2026-11-05, motion + balance 9A and 10A, bring-along 2A and 4A):
 * the people you follow with what each is up to right now and one way to join them; friends (you follow each other)
 * marked; two quick starts to play together; and your invite link with who's joined from it ("Bring your crew").
 *
 * Only what's public: their public profile, their public events, a live stream, a daily they finished today (the
 * result, never the answer). Blocking removes follows both ways, so a blocked person never shows here.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { codeFor } from "@/lib/referrals/store";
import { referralLink } from "@/lib/originals/referral";
import { DAILIES, type DailyGameId } from "@/lib/originals/dailies";
import { GS_TIME_ZONE } from "@/lib/time/gsClock";
import { notStaleOpenFilter } from "@/lib/events/lifecycle";

export interface PersonAvatar { id: string; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null }

export interface Person {
  id: string;
  name: string;
  username: string;
  avatar: PersonAvatar;
  /** You follow each other. */
  friend: boolean;
  online: boolean;
  /** What they're up to: "Live: Mario Kart World", "Hosting Friday trivia · Sat 6:00 PM", "Solved today's Shuffle in 2". */
  status: string;
  action: { label: string; href: string };
  live: boolean;
}

export interface PeopleTile {
  people: Person[];
  /** How many you follow (the card says "Find your people" at 0). */
  following: number;
  /** Today's challenge: your finished daily to send, or the one to play first. */
  challenge: { label: string; href: string };
  invite: { link: string; joined: { name: string; username: string | null; avatar: PersonAvatar }[] } | null;
}

const ONLINE_MS = 5 * 60_000;
const AV = "id, display_name, username, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar, last_seen_at, is_public";
type UserRow = { id: string; display_name: string | null; username: string | null; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null; last_seen_at: string | null; is_public: boolean | null };
const avatarOf = (u: UserRow): PersonAvatar => ({ id: u.id, avatar_source: u.avatar_source, avatar_seed: u.avatar_seed, avatar_options: u.avatar_options, twitch_avatar: u.twitch_avatar, discord_avatar: u.discord_avatar });

const ago = (iso: string | null): string => {
  if (!iso) return "Not around lately";
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `Here ${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Here ${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return d < 14 ? `Here ${d} ${d === 1 ? "day" : "days"} ago` : "Not around lately";
};

const shortWhen = (iso: string, tz: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz });

/** `today`: the room's Today tile games (id, done), for the challenge quick start. */
export async function peopleTile(userId: string, today: { id: DailyGameId; done: boolean; name: string }[], tz = GS_TIME_ZONE): Promise<PeopleTile> {
  const db = createServiceClient();
  const first = today.find((g) => g.done);
  const next = today.find((g) => !g.done) ?? today[0];
  const challenge = first
    ? { label: `Send your ${first.name} result`, href: DAILIES[first.id].href }
    : { label: next ? `Play today's ${next.name}, then send it` : "Play today's dailies", href: next ? DAILIES[next.id].href : "/daily" };

  const [{ data: follows }, code] = await Promise.all([
    db.from("follows").select("followee_user_id").eq("follower_user_id", userId).limit(40),
    codeFor(userId).catch(() => null),
  ]);
  const ids = ((follows ?? []) as { followee_user_id: string }[]).map((f) => f.followee_user_id);

  // Bring your crew: your invite link and who's joined from it (invite links, and links that brought someone).
  let invite: PeopleTile["invite"] = null;
  if (code) {
    const [{ data: refs }, brought] = await Promise.all([
      db.from("referrals").select("account_id, signed_up_at").eq("referrer_id", userId).not("account_id", "is", null).order("signed_up_at", { ascending: false }).limit(8),
      db.from("users").select("id").eq("brought_by_user_id", userId).limit(8).then((r) => (r.error ? [] : (r.data ?? []) as { id: string }[])),
    ]);
    const joinedIds = [...new Set([...((refs ?? []) as { account_id: string }[]).map((r) => r.account_id), ...brought.map((b) => b.id)])].slice(0, 6);
    const { data: joinedRows } = joinedIds.length ? await db.from("users").select(AV).in("id", joinedIds) : { data: [] };
    invite = {
      link: referralLink("/daily", code),
      joined: ((joinedRows ?? []) as UserRow[]).map((u) => ({ name: u.display_name || u.username || "A player", username: u.is_public === false ? null : u.username, avatar: avatarOf(u) })),
    };
  }
  if (!ids.length) return { people: [], following: 0, challenge, invite };

  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const [usersR, backR, liveR, toursR, nightsR] = await Promise.all([
    db.from("users").select(AV).in("id", ids),
    db.from("follows").select("follower_user_id").eq("followee_user_id", userId).in("follower_user_id", ids),
    db.from("twitch_connections").select("user_id, is_live").in("user_id", ids).eq("is_live", true),
    db.from("gs_browse_tournaments").select("id, title, date_time, organizer_id, status").in("organizer_id", ids).in("status", ["open", "in_progress"]).is("archived_at", null)
      .or(notStaleOpenFilter()).lte("date_time", soon).order("date_time", { ascending: true }).limit(20),
    db.from("gs_browse_game_nights").select("id, title, starts_at, host_id").in("host_id", ids).eq("visibility", "public").eq("status", "scheduled").is("archived_at", null)
      .gte("starts_at", now).lte("starts_at", soon).order("starts_at", { ascending: true }).limit(20),
  ]);
  const users = ((usersR.data ?? []) as UserRow[]).filter((u) => u.is_public !== false && u.username);
  const back = new Set(((backR.data ?? []) as { follower_user_id: string }[]).map((r) => r.follower_user_id));
  const live = new Set(((liveR.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const hosting = new Map<string, { title: string; href: string; at: string | null }>();
  for (const t of (toursR.data ?? []) as { id: string; title: string; date_time: string | null; organizer_id: string }[]) if (!hosting.has(t.organizer_id)) hosting.set(t.organizer_id, { title: t.title, href: `/tournament/${t.id}`, at: t.date_time });
  for (const n of (nightsR.data ?? []) as { id: string; title: string; starts_at: string | null; host_id: string }[]) if (!hosting.has(n.host_id)) hosting.set(n.host_id, { title: n.title, href: `/game-nights/${n.id}`, at: n.starts_at });

  const rank = (p: Person) => (p.live ? 0 : p.status.startsWith("Hosting") ? 1 : p.online ? 2 : 3);
  const people = users.map((u): Person => {
    const name = u.display_name || u.username!;
    const online = !!u.last_seen_at && Date.now() - Date.parse(u.last_seen_at) < ONLINE_MS;
    const base = { id: u.id, name, username: u.username!, avatar: avatarOf(u), friend: back.has(u.id), online, live: false };
    if (live.has(u.id)) return { ...base, live: true, status: "Live now", action: { label: "Watch", href: `/live/${u.username}` } };
    const host = hosting.get(u.id);
    if (host) return { ...base, status: `Hosting ${host.title}${host.at ? ` · ${shortWhen(host.at, tz)}` : ""}`, action: { label: "Join", href: host.href } };
    // Today's daily results are on "Your people today" under the dailies (said once), so this card keeps to live,
    // hosting and around.
    return { ...base, status: online ? "Online now" : ago(u.last_seen_at), action: { label: "Profile", href: `/u/${u.username}` } };
  }).sort((a, b) => rank(a) - rank(b) || Number(b.friend) - Number(a.friend)).slice(0, 4);
  return { people, following: ids.length, challenge, invite };
}
