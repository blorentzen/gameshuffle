/**
 * What each event's share card says (see eventCard.tsx for how it looks).
 *
 * Reads with the service client, so every privacy rule is applied here, not
 * by the database: a draft never shows its title (it gets the generic card),
 * an unlisted night never shows its place, and a cancelled event says so.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getGameName } from "@/data/game-registry";
import { boxArt, findGame } from "@/data/game-catalog";
import { FORMAT_LABEL } from "@/data/tournament-formats";
import { nightKindLabel } from "@/lib/game-nights/types";
import { bannerArt, coverArt, type CardArt, type EventCardInput } from "./eventCard";
import { cardDate } from "./meta";
import type { GlyphName } from "./glyphs";

type Glyphs = [GlyphName, GlyphName, GlyphName];

const TOURNAMENT_GLYPHS: Glyphs = ["trophy", "award", "device-gamepad-2"];
const SEASON_GLYPHS: Glyphs = ["crown", "trophy", "calendar-event"];
const LIVE_GLYPHS: Glyphs = ["broadcast", "device-gamepad-2", "trophy"];
const NIGHT_LOOK: Record<string, { glyphs: Glyphs; accent: string }> = {
  board: { glyphs: ["dice-5", "chess", "cards"], accent: "#e8a33d" },
  video: { glyphs: ["device-gamepad-2", "device-tv", "trophy"], accent: "#2766ec" },
  tcg: { glyphs: ["cards", "award", "users"], accent: "#8b5cf6" },
  mixed: { glyphs: ["dice-5", "device-gamepad-2", "cards"], accent: "#1f8a4c" },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function organizerZone(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await createServiceClient().from("users").select("timezone").eq("id", userId).maybeSingle();
  return (data?.timezone as string | null) ?? null;
}

/** The organizer's banner first (it's what they chose), then the game's box art. */
async function artFor(banner: string | null | undefined, gameSlug: string | null | undefined, gameName: string | null | undefined): Promise<CardArt | null> {
  return (await bannerArt(banner)) ?? (await coverArt(boxArt(findGame(gameSlug, gameName))));
}

export function fallbackCard(kind: "tournament" | "game-night" | "championship" | "live"): EventCardInput {
  switch (kind) {
    case "tournament":
      return { kicker: "Tournaments", title: "Run your next tournament on GameShuffle", art: null, glyphs: TOURNAMENT_GLYPHS, accent: "#2766ec" };
    case "game-night":
      return { kicker: "Game nights", title: "Find a game night near you", art: null, glyphs: NIGHT_LOOK.board.glyphs, accent: NIGHT_LOOK.board.accent };
    case "championship":
      return { kicker: "Championship series", title: "A season of racing on GameShuffle", art: null, glyphs: SEASON_GLYPHS, accent: "#8b5cf6" };
    case "live":
      return { kicker: "Live on GameShuffle", title: "Play along with the stream", art: null, glyphs: LIVE_GLYPHS, accent: "#9146ff" };
  }
}

export async function tournamentCard(id: string): Promise<EventCardInput> {
  const db = createServiceClient();
  const { data: t } = await db.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (!t || t.status === "draft") return fallbackCard("tournament");

  const settings = (t.settings ?? {}) as { game_label?: string; locationType?: string; location?: string | null };
  const game = settings.game_label || getGameName(t.game_slug as string);
  const [{ count }, tz, art] = await Promise.all([
    db.from("tournament_participants").select("id", { count: "exact", head: true }).eq("tournament_id", id).neq("status", "dropped"),
    organizerZone(t.organizer_id as string),
    artFor(t.header_image_url as string | null, t.game_slug as string, game),
  ]);
  const players = count ?? 0;
  const max = (t.max_participants as number | null) ?? null;
  const status = t.status as string;
  const format = t.format ? FORMAT_LABEL[t.format as string] ?? null : null;
  const where = settings.locationType === "in_person" ? settings.location?.trim() || "In person" : "Online";
  const date = cardDate(t.date_time as string | null, tz);

  const meta: EventCardInput["meta"] = [];
  if (status === "in_progress") meta.push({ icon: "broadcast", text: "Happening now" });
  if (status === "complete") meta.push({ icon: "trophy", text: "Final results" });
  if (format) meta.push({ icon: "device-gamepad-2", text: format });
  meta.push({
    icon: "users",
    text: status === "open" && max ? `${players} of ${max} spots` : plural(players, "player"),
  });
  if (meta.length < 3) meta.push({ icon: where === "Online" ? "world" : "map-pin", text: where });

  return {
    kicker: `${t.hosted_by_gs ? "Official GameShuffle tournament" : status === "complete" ? "Tournament results" : "Tournament"} · ${game}`,
    title: t.title as string,
    when: status === "cancelled" ? (date ? `Was ${date}` : null) : date,
    meta: status === "cancelled" ? [{ icon: "calendar-event", text: "This tournament was cancelled" }] : meta,
    art,
    glyphs: TOURNAMENT_GLYPHS,
    accent: "#2766ec",
    stamp: status === "cancelled" ? "Cancelled" : null,
  };
}

export async function nightCard(id: string): Promise<EventCardInput> {
  const db = createServiceClient();
  const { data: n } = await db.from("board_game_nights").select("*").eq("id", id).maybeSingle();
  if (!n || n.status === "draft") return fallbackCard("game-night");

  const kind = (n.kind as string | null) ?? "board";
  const look = NIGHT_LOOK[kind] ?? NIGHT_LOOK.board;
  const { count } = await db.from("board_game_night_rsvps").select("user_id", { count: "exact", head: true }).eq("night_id", id).eq("status", "going");
  const going = count ?? 0;
  const capacity = (n.capacity as number | null) ?? null;
  const cancelled = n.status === "cancelled";
  const past = n.status === "ended" || (n.starts_at ? new Date(n.starts_at as string).getTime() < Date.now() : false);
  const date = cardDate(n.starts_at as string | null, n.timezone as string | null);
  const locType = (n.location_type as string | null) ?? "in_person";

  const meta: EventCardInput["meta"] = [];
  // An unlisted night is link-only: its place stays off the card.
  if (locType === "online") meta.push({ icon: "world", text: "Online" });
  else if (n.visibility === "public" && n.place) meta.push({ icon: "map-pin", text: n.place as string });
  const left = capacity != null ? Math.max(0, capacity - going) : null;
  meta.push({
    icon: "users",
    text: past ? `${going} went` : left == null ? `${going} going` : left === 0 ? `${going} going · full` : `${going} going · ${plural(left, "spot")} left`,
  });

  return {
    kicker: `Game night · ${nightKindLabel(kind)}`,
    title: n.title as string,
    when: cancelled ? (date ? `Was ${date}` : null) : date,
    meta: cancelled ? [{ icon: "calendar-event", text: "This night was cancelled" }] : meta,
    art: await bannerArt(n.cover_image_url as string | null),
    glyphs: look.glyphs,
    accent: look.accent,
    stamp: cancelled ? "Cancelled" : null,
  };
}

export async function championshipCard(id: string, opts: { invite?: boolean } = {}): Promise<EventCardInput> {
  const db = createServiceClient();
  const { data: c } = await db.from("championships").select("*").eq("id", id).maybeSingle();
  if (!c) return fallbackCard("championship");

  const settings = (c.settings ?? {}) as { game_label?: string };
  const game = settings.game_label || getGameName(c.game_slug as string);
  const [{ data: events }, { count: members }, tz, art] = await Promise.all([
    db.from("tournaments").select("id, event_number, date_time, status").eq("championship_id", id).neq("status", "cancelled").order("event_number", { ascending: true }),
    db.from("championship_members").select("id", { count: "exact", head: true }).eq("championship_id", id).eq("status", "joined"),
    organizerZone(c.owner_id as string),
    coverArt(boxArt(findGame(c.game_slug as string, game))),
  ]);
  const list = (events ?? []) as { event_number: number | null; date_time: string | null; status: string }[];
  const now = Date.now();
  const next = list.find((e) => e.status === "in_progress") ?? list.find((e) => e.status === "open" && (!e.date_time || new Date(e.date_time).getTime() >= now - 6 * 3600_000));
  const nextIndex = next ? list.indexOf(next) + 1 : 0;
  const nextDate = next ? cardDate(next.date_time, tz)?.split(" · ")[0] ?? null : null;

  const when = c.status === "archived"
    ? "Season complete"
    : next
      ? `Event ${next.event_number ?? nextIndex} of ${list.length}${next.status === "in_progress" ? " · on now" : nextDate ? ` · ${nextDate}` : ""}`
      : list.length > 0 ? "Next event to be announced" : "Season starting soon";

  return {
    kicker: `${opts.invite ? "You're invited" : "Championship"} · ${game}`,
    title: c.name as string,
    when,
    meta: [
      { icon: "users", text: plural(members ?? 0, "racer") },
      ...(list.length > 0 ? [{ icon: "flag" as const, text: plural(list.length, "event") }] : []),
    ],
    art,
    glyphs: SEASON_GLYPHS,
    accent: "#8b5cf6",
  };
}

export async function championshipInviteCard(token: string): Promise<EventCardInput> {
  const { data: inv } = await createServiceClient()
    .from("championship_invitations")
    .select("championship_id, status")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.status === "revoked") return fallbackCard("championship");
  return championshipCard(inv.championship_id as string, { invite: true });
}

export async function liveCard(slug: string): Promise<EventCardInput> {
  const db = createServiceClient();
  const handle = slug.toLowerCase();
  const fields = "id, username, display_name, twitch_username, profile_banner_url, timezone, is_public";
  const { data: byUsername } = await db.from("users").select(fields).eq("username", handle).maybeSingle();
  const user = byUsername ?? (await db.from("users").select(fields).eq("twitch_username", handle).limit(1).maybeSingle()).data;
  if (!user) return fallbackCard("live");

  const [{ data: conn }, { data: upcoming }] = await Promise.all([
    db.from("twitch_connections").select("twitch_login, is_live").eq("user_id", user.id).maybeSingle(),
    db.from("gs_sessions").select("name, scheduled_at").eq("owner_user_id", user.id).eq("status", "scheduled").gte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const name = (user.display_name as string | null) || (conn?.twitch_login as string | null) || (user.twitch_username as string | null) || slug;
  const login = (conn?.twitch_login as string | null) || (user.twitch_username as string | null);
  const live = !!conn?.is_live;
  const next = upcoming?.scheduled_at ? cardDate(upcoming.scheduled_at as string, user.timezone as string | null) : null;

  return {
    kicker: "Live on GameShuffle",
    title: name,
    when: live ? "Live now" : next ? `Next stream ${next}` : null,
    meta: [
      ...(login ? [{ icon: "brand-twitch" as const, text: `twitch.tv/${login}` }] : []),
      { icon: "device-gamepad-2" as const, text: "Play along from chat" },
    ],
    art: user.is_public ? await bannerArt(user.profile_banner_url as string | null) : null,
    glyphs: LIVE_GLYPHS,
    accent: "#9146ff",
  };
}

/** The card for an event, or the generic one if anything goes wrong: a broken preview is worse than a plain one. */
export async function shareCard(kind: Parameters<typeof fallbackCard>[0], load: () => Promise<EventCardInput>): Promise<EventCardInput> {
  try {
    return await load();
  } catch (err) {
    console.error(`[og] ${kind} card failed`, err);
    return fallbackCard(kind);
  }
}
