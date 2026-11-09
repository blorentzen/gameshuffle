import "server-only";

/**
 * What a game space shows (game spaces picks 2026-11-05, all A; phone picks the same day, all A). Everyone's view of
 * one game: members and who's online, what's happening (live streams, tournaments, game nights), this week's boards,
 * events, people and crews; plus the signed-in viewer's own slice (their lounge, best time, saved build) and whether
 * they've joined. Every read fails quietly to empty, like the hub it grew from.
 *
 * Members = accounts with one of the space's games in their games (users.favorite_games, stored as names); joining
 * adds the space's main game there (phone picks 5A), so the home's doors and the profile's Plays follow.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { GAME_CATALOG } from "@/data/game-catalog";
import { MAX_FAVORITE_GAMES } from "@/data/favorite-games";
import { gameEntry, gameKey } from "./key";
import type { GameSpace } from "./spaces";
import { notStaleOpenFilter, isStaleOpen } from "@/lib/events/lifecycle";
import { gameArt, when, TESTY, photoArt, type Happening } from "@/lib/home/happening";
import { getGameName } from "@/data/game-registry";
import { linksFor } from "@/lib/lounge/store";
import { playerBests } from "@/lib/timeTrials/store";
import { ttTrack, trackPath, TT_GAMES } from "@/lib/timeTrials/tracks";
import { formatTime, ttPlayer } from "@/lib/timeTrials/rules";
import type { Person, PersonAvatar } from "@/lib/home/people";
import { seasonKey, seasonRange, rankFor } from "@/lib/seasons/ranks";
import { listGameFeed } from "@/lib/social/feed";
import { cleanRoll } from "@/lib/rolls/spaceRoll";
import type { ChatRoll } from "@/lib/twitch/chatRoll";

const ONLINE_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/** Every name the space's games are stored under in favorite_games (catalog names and aliases). */
export function memberNames(s: GameSpace): string[] {
  const out = new Set<string>();
  for (const k of s.games) {
    const g = GAME_CATALOG.find((x) => x.slug === k);
    if (!g) continue;
    out.add(g.name);
    for (const a of g.aliases ?? []) out.add(a);
  }
  return [...out];
}

export interface SpaceCounts { members: number; online: number }

export async function spaceCounts(s: GameSpace): Promise<SpaceCounts> {
  const db = createServiceClient();
  const names = memberNames(s);
  const since = new Date(Date.now() - ONLINE_MS).toISOString();
  const [m, o] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }).overlaps("favorite_games", names).then((r) => r.count ?? 0),
    db.from("users").select("id", { count: "exact", head: true }).overlaps("favorite_games", names).gte("last_seen_at", since).then((r) => r.count ?? 0),
  ]).catch(() => [0, 0]);
  return { members: m, online: o };
}

/** Whether this account has joined (one of the space's games is in its games). */
export async function spaceJoined(s: GameSpace, userId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("users").select("favorite_games").eq("id", userId).maybeSingle();
  const favs = ((data as { favorite_games: string[] | null } | null)?.favorite_games) ?? [];
  return favs.some((f) => { const k = gameKey(f); return !!k && s.games.includes(k); });
}

/** Join adds the space's main game to your games; leaving takes every one of its games out. */
export async function setJoined(s: GameSpace, userId: string, join: boolean): Promise<{ ok: true; joined: boolean } | { ok: false; error: "full" | "failed" }> {
  const db = createServiceClient();
  const { data } = await db.from("users").select("favorite_games").eq("id", userId).maybeSingle();
  const favs = ((data as { favorite_games: string[] | null } | null)?.favorite_games) ?? [];
  const mine = (f: string) => { const k = gameKey(f); return !!k && s.games.includes(k); };
  let next: string[];
  if (join) {
    if (favs.some(mine)) return { ok: true, joined: true };
    if (favs.length >= MAX_FAVORITE_GAMES) return { ok: false, error: "full" };
    next = [...favs, gameEntry(s.primary)?.name ?? s.name];
  } else {
    next = favs.filter((f) => !mine(f));
  }
  const { error } = await db.from("users").update({ favorite_games: next }).eq("id", userId);
  return error ? { ok: false, error: "failed" } : { ok: true, joined: join };
}

type TourRow = { id: string; title: string; date_time: string | null; game_slug: string | null; status: string; going_count: number | null; max_participants: number | null; cover_image_url?: string | null; organizer_name?: string | null; archived_at: string | null };
type NightRow = { id: string; title: string; starts_at: string | null; place: string | null; cover_image_url: string | null; going_count: number | null; games: { name?: string }[] | null };

const tourItem = (t: TourRow): Happening => {
  const running = t.status === "in_progress";
  const going = t.going_count ?? 0;
  return {
    id: `t:${t.id}`, world: "compete", kicker: running ? "Tournament" : when(t.date_time, false), live: running, title: t.title,
    line: [t.max_participants ? `${going} of ${t.max_participants} in` : going ? `${going} in` : null, t.organizer_name].filter(Boolean).join(" · ") || "Open to join",
    href: `/tournament/${t.id}`, weight: running ? 4 : t.date_time && Date.parse(t.date_time) - Date.now() < DAY_MS ? 3 : 2,
    art: t.cover_image_url ? { kind: "img", src: t.cover_image_url } : gameArt(t.game_slug) ?? photoArt("pick-bracket", { kind: "tone", tone: "teal", icon: "bracket" }),
  };
};

const nightItem = (n: NightRow, s: GameSpace): Happening => ({
  id: `n:${n.id}`, world: "host", kicker: when(n.starts_at, false), title: n.title,
  line: [n.going_count ? `${n.going_count} going` : null, n.place || "Online"].filter(Boolean).join(" · "),
  href: `/game-nights/${n.id}`, weight: n.starts_at && Date.parse(n.starts_at) - Date.now() < DAY_MS ? 3 : 2,
  art: n.cover_image_url ? { kind: "img", src: n.cover_image_url } : gameArt(s.primary) ?? { kind: "img", src: "/images/lifestyle/hero-game-nights.96d98118.jpg" },
});

/** Upcoming events in the space's games: tournaments (running first) and public game nights, soonest first. */
export async function spaceEvents(s: GameSpace, days = 30, limit = 24): Promise<Happening[]> {
  const db = createServiceClient();
  const until = new Date(Date.now() + days * DAY_MS).toISOString();
  const [tours, nights] = await Promise.all([
    db.from("gs_browse_tournaments").select("id, title, date_time, game_slug, status, going_count, max_participants, organizer_name, archived_at")
      .in("game_slug", s.games).in("status", ["open", "in_progress"]).is("archived_at", null).is("championship_id", null)
      .or(notStaleOpenFilter()).or(`date_time.is.null,date_time.lte.${until}`)
      .order("date_time", { ascending: true, nullsFirst: false }).limit(40)
      .then((r) => ((r.data ?? []) as TourRow[]).filter((t) => !TESTY.test(t.title) && !isStaleOpen({ status: t.status, date_time: t.date_time }))),
    db.from("gs_browse_game_nights").select("id, title, starts_at, place, cover_image_url, going_count, games")
      .eq("visibility", "public").eq("status", "scheduled").is("archived_at", null)
      .gte("starts_at", new Date().toISOString()).lte("starts_at", until).order("starts_at", { ascending: true }).limit(80)
      .then((r) => ((r.data ?? []) as NightRow[]).filter((n) => !TESTY.test(n.title) && (n.games ?? []).some((g) => { const k = gameKey(g?.name); return !!k && s.games.includes(k); }))),
  ]).catch(() => [[], []] as [TourRow[], NightRow[]]);
  const at = (h: Happening, iso: string | null) => ({ h, t: h.live ? 0 : iso ? Date.parse(iso) : Infinity });
  return [...tours.map((t) => at(tourItem(t), t.date_time)), ...nights.map((n) => at(nightItem(n, s), n.starts_at))]
    .sort((a, b) => a.t - b.t).slice(0, limit).map((x) => x.h);
}

/** What's happening right now: live streams in the game, then events running or within the week. */
export async function spaceHappening(s: GameSpace, limit = 3): Promise<Happening[]> {
  const db = createServiceClient();
  const live: Happening[] = [];
  try {
    const { data } = await db.from("gs_sessions").select("id, name, owner_user_id, active_game, feature_flags").eq("status", "active").in("active_game", s.games).limit(20);
    const rows = ((data ?? []) as { id: string; name: string; owner_user_id: string; active_game: string; feature_flags: { test_session?: boolean } | null }[])
      .filter((r) => !r.feature_flags?.test_session && !TESTY.test(r.name));
    if (rows.length) {
      const owners = [...new Set(rows.map((r) => r.owner_user_id))];
      const [{ data: tw }, { data: us }] = await Promise.all([
        db.from("twitch_connections").select("user_id, is_live").in("user_id", owners).eq("is_live", true),
        db.from("users").select("id, username, display_name, is_public").in("id", owners),
      ]);
      const onAir = new Set(((tw ?? []) as { user_id: string }[]).map((t) => t.user_id));
      const who = new Map(((us ?? []) as { id: string; username: string | null; display_name: string | null; is_public: boolean | null }[]).filter((u) => u.username && u.is_public !== false).map((u) => [u.id, u]));
      for (const r of rows) {
        const u = who.get(r.owner_user_id);
        if (!u || !onAir.has(r.owner_user_id)) continue;
        live.push({ id: `live:${r.id}`, world: "stream", kicker: `${u.display_name || u.username} on Twitch`, live: true, title: r.name, line: getGameName(r.active_game), href: `/live/${u.username}`, weight: 5, art: gameArt(r.active_game) ?? photoArt("pick-stream", { kind: "tone", tone: "teal", icon: "broadcast" }) });
      }
    }
  } catch { /* no streams */ }
  const events = await spaceEvents(s, 7, limit);
  return [...live, ...events].sort((a, b) => b.weight - a.weight).slice(0, limit);
}

type UserRow = { id: string; display_name: string | null; username: string | null; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null; last_seen_at: string | null };
const avatarOf = (u: UserRow): PersonAvatar => ({ id: u.id, avatar_source: u.avatar_source, avatar_seed: u.avatar_seed, avatar_options: u.avatar_options, twitch_avatar: u.twitch_avatar, discord_avatar: u.discord_avatar });

const ago = (iso: string | null): string => {
  if (!iso) return "Not around lately";
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `Here ${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Here ${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return d < 14 ? `Here ${d} ${d === 1 ? "day" : "days"} ago` : "Not around lately";
};

/**
 * The space's people: live first, then online, then friends (you follow each other), then the most recently around.
 * Only public profiles; never anyone you've blocked or who blocked you (blocking removes follows, and the profile
 * rule hides suspended accounts).
 */
export async function spacePeople(s: GameSpace, viewerId: string | null, limit = 24): Promise<Person[]> {
  const db = createServiceClient();
  const { data } = await db.from("users").select("id, display_name, username, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar, last_seen_at")
    .overlaps("favorite_games", memberNames(s)).eq("is_public", true).not("username", "is", null).in("moderation_status", ["ok", "warned"])
    .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(limit * 3);
  const users = ((data ?? []) as UserRow[]).filter((u) => u.id !== viewerId);
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const [{ data: live }, { data: here }, mine, back, blocked] = await Promise.all([
    db.from("twitch_connections").select("user_id").in("user_id", ids).eq("is_live", true),
    // Live counts only in this space's games: a stream on another game isn't "playing now" here.
    db.from("gs_sessions").select("owner_user_id").eq("status", "active").in("active_game", s.games).in("owner_user_id", ids),
    viewerId ? db.from("follows").select("followee_user_id").eq("follower_user_id", viewerId).in("followee_user_id", ids).then((r) => new Set(((r.data ?? []) as { followee_user_id: string }[]).map((x) => x.followee_user_id))) : Promise.resolve(new Set<string>()),
    viewerId ? db.from("follows").select("follower_user_id").eq("followee_user_id", viewerId).in("follower_user_id", ids).then((r) => new Set(((r.data ?? []) as { follower_user_id: string }[]).map((x) => x.follower_user_id))) : Promise.resolve(new Set<string>()),
    viewerId ? db.from("user_blocks").select("blocker_user_id, blocked_user_id").or(`blocker_user_id.eq.${viewerId},blocked_user_id.eq.${viewerId}`).then((r) => new Set(((r.data ?? []) as { blocker_user_id: string; blocked_user_id: string }[]).map((b) => (b.blocker_user_id === viewerId ? b.blocked_user_id : b.blocker_user_id))), () => new Set<string>()) : Promise.resolve(new Set<string>()),
  ]);
  const inGame = new Set(((here ?? []) as { owner_user_id: string }[]).map((r) => r.owner_user_id));
  const onAir = new Set(((live ?? []) as { user_id: string }[]).map((l) => l.user_id).filter((id) => inGame.has(id)));
  const people = users.filter((u) => !blocked.has(u.id)).map((u): Person & { rank: number } => {
    const online = !!u.last_seen_at && Date.now() - Date.parse(u.last_seen_at) < ONLINE_MS;
    const friend = mine.has(u.id) && back.has(u.id);
    const isLive = onAir.has(u.id);
    const base = { id: u.id, name: u.display_name || u.username!, username: u.username!, avatar: avatarOf(u), friend, online, live: isLive };
    const rank = isLive ? 0 : online ? 1 : friend ? 2 : 3;
    return isLive
      ? { ...base, status: "Live now", action: { label: "Watch", href: `/live/${u.username}` }, rank }
      : { ...base, status: online ? "Online now" : ago(u.last_seen_at), action: { label: "Profile", href: `/u/${u.username}` }, rank };
  });
  return people.sort((a, b) => a.rank - b.rank || Number(b.friend) - Number(a.friend)).slice(0, limit).map((p): Person => { const { rank, ...rest } = p; void rank; return rest; });
}

export interface SpaceCrew { id: string; name: string; slug: string; members: number }

/** Crews in the space's games, biggest first (a crew's own page stays at /c/<slug>). */
export async function spaceCrews(s: GameSpace, limit = 6): Promise<SpaceCrew[]> {
  const db = createServiceClient();
  const { data } = await db.from("community_crew_members").select("community_id, game").limit(2000);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { community_id: string; game: string }[]) {
    const k = gameKey(r.game);
    if (k && s.games.includes(k)) counts.set(r.community_id, (counts.get(r.community_id) ?? 0) + 1);
  }
  if (!counts.size) return [];
  const { data: comms } = await db.from("gs_communities").select("id, slug, display_name").in("id", [...counts.keys()]);
  return ((comms ?? []) as { id: string; slug: string; display_name: string | null }[])
    .filter((c) => c.slug && !TESTY.test(c.display_name ?? ""))
    .map((c) => ({ id: c.id, name: c.display_name || c.slug, slug: c.slug, members: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.members - a.members).slice(0, limit);
}

/** The viewer's own slice of the space: their lounge, best time trial and saved build in this game. */
export interface SpaceYou {
  lounge: { name: string; mmr: number | null; division: string | null; href: string } | null;
  best: { track: string; image: string | null; time: string; place: number; total: number; href: string } | null;
  build: { character: { name: string; img: string }; vehicle: { name: string; img: string }; href: string } | null;
}

export async function spaceYou(s: GameSpace, userId: string): Promise<SpaceYou> {
  const [links, bests, builds] = await Promise.all([
    s.lounge?.length ? linksFor(userId).catch(() => []) : Promise.resolve([]),
    s.tt ? playerBests(ttPlayer("u", userId)).catch(() => []) : Promise.resolve([]),
    createServiceClient().from("saved_configs").select("id, randomizer_slug, config_data").eq("user_id", userId).in("randomizer_slug", s.games).order("created_at", { ascending: false }).limit(10)
      .then((r) => (r.data ?? []) as { id: string; randomizer_slug: string; config_data: { type?: string; character?: { name?: string; img?: string }; vehicle?: { name?: string; img?: string } } | null }[], () => []),
  ]);
  const link = links.find((l) => s.lounge!.includes(l.game as never)) ?? null;
  const b = bests.find((x) => x.game === s.tt && x.vehicle === "any") ?? null;
  const t = b ? ttTrack(b.game, b.track) : null;
  const build = builds.find((r) => r.config_data?.type === "kart-build" && r.config_data.character?.img && r.config_data.vehicle?.img);
  return {
    lounge: link ? { name: link.name, mmr: link.mmr ?? null, division: link.division ?? null, href: `/lounge/${encodeURIComponent(link.name)}?game=${link.game}` } : null,
    best: b && t ? { track: t.name, image: t.image, time: formatTime(b.timeMs), place: b.place, total: b.total, href: trackPath(t, b.cc, { items: b.items }) } : null,
    build: build ? { character: { name: build.config_data!.character!.name ?? "Your racer", img: build.config_data!.character!.img! }, vehicle: { name: build.config_data!.vehicle!.name ?? "your kart", img: build.config_data!.vehicle!.img! }, href: `/randomizers/${build.randomizer_slug}?config=${build.id}` } : null,
  };
}

export { TT_GAMES };

export interface SpaceSeasonRow { userId: string; name: string; username: string | null; avatar: PersonAvatar; points: number; rank: string; you: boolean }

/**
 * This month's GameShuffle points in the space's games (live nights' placements, missions and calls; seasons run on
 * Pacific calendar months), best first: the Boards tab for games without time trials or a lounge. Public profiles only.
 */
export async function spaceSeason(s: GameSpace, viewerId: string | null, limit = 25): Promise<{ rows: SpaceSeasonRow[]; month: string }> {
  const key = seasonKey();
  const { start, end } = seasonRange(key);
  const db = createServiceClient();
  const { data } = await db.from("party_points").select("user_id, points, game_slug").gte("created_at", start).lt("created_at", end).limit(5000);
  const totals = new Map<string, number>();
  for (const r of (data ?? []) as { user_id: string | null; points: number; game_slug: string | null }[]) {
    const k = gameKey(r.game_slug);
    if (!r.user_id || !k || !s.games.includes(k)) continue;
    totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + (r.points ?? 0));
  }
  const month = new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long" });
  const ids = [...totals.entries()].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, limit * 2).map(([id]) => id);
  if (!ids.length) return { rows: [], month };
  const { data: us } = await db.from("users").select("id, display_name, username, is_public, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar, last_seen_at").in("id", ids);
  const byId = new Map(((us ?? []) as (UserRow & { is_public: boolean | null })[]).filter((u) => u.is_public !== false && u.username).map((u) => [u.id, u]));
  const rows = ids.flatMap((id) => {
    const u = byId.get(id);
    if (!u) return [];
    const points = totals.get(id) ?? 0;
    return [{ userId: id, name: u.display_name || u.username!, username: u.username, avatar: avatarOf(u), points, rank: rankFor(points).label, you: id === viewerId }];
  }).slice(0, limit);
  return { rows, month };
}

const agoShort = (iso: string): string => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
};

/** One roll in Rolling now: a shared roll post, or a roll on stream (the streamer's own, or one from their chat). */
export interface RollItem {
  id: string;
  who: string;
  avatar: PersonAvatar | null;
  /** "rolled", "rolled on stream", "rolled in Nova's chat". */
  verb: string;
  at: string;
  /** "4 min ago". */
  when: string;
  roll: ChatRoll;
  href: string;
  live: boolean;
  reactions: number;
  comments: number;
}

/**
 * Rolling now (round two picks 6A, 7A): rolls people shared in the space this week, and rolls on stream in its games
 * in the last two days (already public on the stream), newest first.
 */
export async function spaceRolls(s: GameSpace, viewerId: string | null, limit = 10): Promise<RollItem[]> {
  const db = createServiceClient();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const twoDays = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const [posts, events] = await Promise.all([
    listGameFeed({ games: s.games, viewerId, limit, kind: "roll", since: week }).catch(() => []),
    db.from("session_events").select("id, created_at, session_id, payload").eq("event_type", "shuffle").gte("created_at", twoDays).order("created_at", { ascending: false }).limit(60)
      .then((r) => (r.data ?? []) as { id: string; created_at: string; session_id: string; payload: { combo?: unknown; is_broadcaster?: boolean; twitch_display_name?: string } | null }[], () => []),
  ]);
  const items: RollItem[] = posts.flatMap((p) => (p.meta?.roll ? [{
    id: `p:${p.id}`, who: p.author.name, avatar: { id: p.author.id, avatar_source: p.author.avatarSource, avatar_seed: p.author.avatarSeed, avatar_options: p.author.avatarOptions, twitch_avatar: p.author.twitchAvatar, discord_avatar: p.author.discordAvatar },
    verb: "rolled", at: p.createdAt, when: agoShort(p.createdAt), roll: p.meta.roll, href: `/community/post/${p.id}`, live: false,
    reactions: p.reactions.reduce((n, r) => n + r.count, 0), comments: p.commentCount,
  }] : []));
  const mine = events.map((e) => ({ e, roll: cleanRoll(e.payload?.combo) })).filter((x) => x.roll && s.games.includes(gameKey(x.roll.game) ?? ""));
  if (mine.length) {
    const sessionIds = [...new Set(mine.map((x) => x.e.session_id))];
    const { data: sessions } = await db.from("gs_sessions").select("id, owner_user_id, feature_flags").in("id", sessionIds);
    const sess = new Map(((sessions ?? []) as { id: string; owner_user_id: string; feature_flags: { test_session?: boolean } | null }[]).filter((x) => !x.feature_flags?.test_session).map((x) => [x.id, x.owner_user_id]));
    const owners = [...new Set([...sess.values()])];
    const [{ data: us }, { data: tw }] = await Promise.all([
      owners.length ? db.from("users").select("id, display_name, username, is_public, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar, last_seen_at").in("id", owners) : Promise.resolve({ data: [] }),
      owners.length ? db.from("twitch_connections").select("user_id").in("user_id", owners).eq("is_live", true) : Promise.resolve({ data: [] }),
    ]);
    const byId = new Map(((us ?? []) as (UserRow & { is_public: boolean | null })[]).filter((u) => u.is_public !== false && u.username).map((u) => [u.id, u]));
    const onAir = new Set(((tw ?? []) as { user_id: string }[]).map((t) => t.user_id));
    for (const { e, roll } of mine) {
      const owner = byId.get(sess.get(e.session_id) ?? "");
      if (!owner || !roll) continue;
      const streamer = owner.display_name || owner.username!;
      const self = e.payload?.is_broadcaster !== false;
      items.push({
        id: `s:${e.id}`, who: self ? streamer : (e.payload?.twitch_display_name || "A viewer"), avatar: self ? avatarOf(owner) : null,
        verb: self ? "rolled on stream" : `rolled in ${streamer}'s chat`, at: e.created_at, when: agoShort(e.created_at), roll, href: `/live/${owner.username}`,
        live: onAir.has(owner.id), reactions: 0, comments: 0,
      });
    }
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
