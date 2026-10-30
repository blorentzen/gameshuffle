import "server-only";

/**
 * Time trials (server). Adding times, boards by scope, a player's bests, reports,
 * Discord server verification and the players each server has seen. Every read
 * and write goes through the service role (supabase/time-trials-m1.sql); until
 * that runs, reads come back empty and writes say `not_ready`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { formatTime, rankRows, type ProofKind, type TtPlayer, type VideoState } from "./rules";
import { categoryText, TOP_TEN, type TtItems, type TtVehicle } from "./categories";
import { playerPagePath } from "./playerPath";
import { isClassFor, trackPath, ttTrack, TT_GAMES, type TtClass, type TtGame } from "./tracks";
import { createNotification } from "@/lib/social/notifications";
import { fasterThanRecord } from "./records";

export type TtScope = "everyone" | "friends" | "crew" | "server";

export interface TtBoardRow {
  rank: number;
  player: string;
  name: string;
  avatar: string | null;
  profile: string | null;
  discord: boolean;
  timeId: string;
  timeMs: number;
  proof: ProofKind;
  proofUrl: string | null;
  verifiedIn: string[];
  at: string;
  you: boolean;
  /** Set with a restricted vehicle (shows on the open board too). */
  vehicle: TtVehicle;
  video: VideoState;
  videoUrl: string | null;
  /** Came in with a Quaxly or list import (no proof). */
  imported: boolean;
  /** The player's time trials page. */
  page: string;
  /** In the top ten of this board for everyone (whatever the scope shown): only these need a clip. */
  top: boolean;
}

export interface TtBoard {
  game: TtGame;
  track: string;
  cc: TtClass;
  items: TtItems;
  vehicle: TtVehicle;
  scope: TtScope;
  proofOnly: boolean;
  /** Only verified times (a reviewer checked the clip). */
  verifiedOnly: boolean;
  rows: TtBoardRow[];
  /** The viewer's own row when it isn't in the rows shown. */
  mine: TtBoardRow | null;
  total: number;
}

export interface AddTimeInput {
  player: TtPlayer;
  userId: string | null;
  identityId: string | null;
  game: TtGame;
  track: string;
  cc: TtClass;
  items?: TtItems;
  vehicle?: TtVehicle;
  timeMs: number;
  proof: ProofKind;
  proofUrl: string | null;
  readByAi: boolean;
  source: "site" | "discord" | "import";
  guildId?: string | null;
}

export type AddTimeResult =
  | { ok: true; timeId: string; best: boolean; previousMs: number | null; place: number; total: number; server: { place: number; total: number } | null; again: boolean; items: TtItems; vehicle: TtVehicle;
      /** The time is in its board's top ten: it shows as Unverified until a reviewer checks its clip (4A). */
      needsVideo: boolean }
  | { ok: false; error: "not_ready" | "bad_track" | "bad_class" | "faster_than_record" | "failed" };

let ready: boolean | null = null;
/** Whether time-trials-m1.sql has run (kept once it has). */
export async function ttReady(): Promise<boolean> {
  if (ready) return true;
  // A plain read: a count-only (HEAD) request doesn't report a missing table.
  const { error } = await createServiceClient().from("tt_times").select("id").limit(1);
  ready = !error;
  return ready;
}

async function previousBest(player: string, game: TtGame, track: string, cc: TtClass, items: TtItems, vehicle: TtVehicle): Promise<number | null> {
  let q = createServiceClient().from("tt_times").select("time_ms")
    .eq("player", player).eq("game", game).eq("track", track).eq("cc", cc).eq("items", items).eq("status", "ok");
  if (vehicle !== "any") q = q.eq("vehicle", vehicle);
  const { data } = await q.order("time_ms", { ascending: true }).limit(1).maybeSingle();
  return (data as { time_ms: number } | null)?.time_ms ?? null;
}

/** A time's place on a board (the open board with vehicle "any"). */
export async function placeOf(game: TtGame, track: string, cc: TtClass, timeMs: number, player: string, players: string[] | null, items: TtItems = "shrooms", vehicle: TtVehicle = "any"): Promise<{ place: number; total: number }> {
  const { data } = await createServiceClient().rpc("tt_place2", { p_game: game, p_track: track, p_cc: cc, p_items: items, p_vehicle: vehicle, p_time_ms: timeMs, p_player: player, p_players: players });
  const row = (Array.isArray(data) ? data[0] : data) as { place: number; total: number } | undefined;
  return { place: row?.place ?? 1, total: row?.total ?? 1 };
}

/** Saves a time. The same time on the same track within ten minutes is the first one again (a double tap or a retried command). */
export async function addTime(input: AddTimeInput): Promise<AddTimeResult> {
  if (!(await ttReady())) return { ok: false, error: "not_ready" };
  if (!ttTrack(input.game, input.track)) return { ok: false, error: "bad_track" };
  if (!isClassFor(input.game, input.cc)) return { ok: false, error: "bad_class" };
  if (fasterThanRecord(input.game, input.track, input.cc, input.timeMs)) return { ok: false, error: "faster_than_record" };
  const items: TtItems = input.items ?? "shrooms";
  // Vehicle boards are Mario Kart 8 Deluxe only.
  const vehicle: TtVehicle = input.game === "mk8dx" ? input.vehicle ?? "any" : "any";
  const db = createServiceClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dupe } = await db.from("tt_times").select("id").eq("player", input.player).eq("game", input.game)
    .eq("track", input.track).eq("cc", input.cc).eq("items", items).eq("vehicle", vehicle).eq("time_ms", input.timeMs).eq("status", "ok").gte("created_at", since).limit(1).maybeSingle();
  const previousMs = await previousBest(input.player, input.game, input.track, input.cc, items, vehicle);
  let timeId = (dupe as { id: string } | null)?.id ?? null;
  const again = !!timeId;
  if (!timeId) {
    const { data, error } = await db.from("tt_times").insert({
      player: input.player,
      user_id: input.userId,
      identity_id: input.identityId,
      game: input.game,
      track: input.track,
      cc: input.cc,
      items,
      vehicle,
      time_ms: input.timeMs,
      proof_kind: input.proof,
      proof_url: input.proofUrl,
      read_by_ai: input.readByAi,
      source: input.source,
      guild_id: input.guildId ?? null,
    }).select("id").single();
    if (error || !data) { console.error("[tt] add failed:", error?.message); return { ok: false, error: "failed" }; }
    timeId = (data as { id: string }).id;
  }
  const best = previousMs == null || input.timeMs < previousMs || (again && previousMs === input.timeMs);
  const bestMs = previousMs == null ? input.timeMs : Math.min(previousMs, input.timeMs);
  // Places on the board the time was set for (a vehicle board when there is one), and the open board for the video check.
  const [place, open, server] = await Promise.all([
    placeOf(input.game, input.track, input.cc, bestMs, input.player, null, items, vehicle),
    vehicle === "any" ? Promise.resolve(null) : placeOf(input.game, input.track, input.cc, input.timeMs, input.player, null, items, "any"),
    input.guildId ? guildPlayers(input.guildId).then((ps) => placeOf(input.game, input.track, input.cc, bestMs, input.player, ps, items, vehicle)) : Promise.resolve(null),
  ]);
  const needsVideo = best && (place.place <= TOP_TEN || (open?.place ?? Infinity) <= TOP_TEN);
  return { ok: true, timeId, best, previousMs: again ? null : previousMs, place: place.place, total: place.total, server, again, items, vehicle, needsVideo };
}

/** The players a Discord server has seen use /gs-tt. */
export async function guildPlayers(guildId: string): Promise<string[]> {
  const { data } = await createServiceClient().from("tt_guild_players").select("player").eq("guild_id", guildId).limit(5000);
  return ((data ?? []) as { player: string }[]).map((r) => r.player);
}

/** The Discord servers a player has used /gs-tt in (the board's server picker on the site). */
export async function serversFor(player: TtPlayer): Promise<{ guildId: string; name: string }[]> {
  if (!(await ttReady())) return [];
  const { data } = await createServiceClient().from("tt_guild_players").select("guild_id, guild_name").eq("player", player).order("seen_at", { ascending: false }).limit(20);
  return ((data ?? []) as { guild_id: string; guild_name: string | null }[]).map((r) => ({ guildId: r.guild_id, name: r.guild_name || "A Discord server" }));
}

export async function noteGuildPlayer(guildId: string, player: TtPlayer, guildName: string | null): Promise<void> {
  if (!(await ttReady())) return;
  const row: Record<string, unknown> = { guild_id: guildId, player, seen_at: new Date().toISOString() };
  if (guildName) row.guild_name = guildName;
  await createServiceClient().from("tt_guild_players").upsert(row, { onConflict: "guild_id,player" });
}

/** The players a scope covers, or null for everyone. Friends = you and who you follow; crew = anyone on a crew with you. */
async function scopePlayers(scope: TtScope, viewer: TtPlayer | null, guildId: string | null): Promise<string[] | null> {
  if (scope === "everyone") return null;
  if (scope === "server") return guildId ? guildPlayers(guildId) : [];
  const userId = viewer?.startsWith("u:") ? viewer.slice(2) : null;
  if (!userId) return viewer ? [viewer] : [];
  const db = createServiceClient();
  if (scope === "friends") {
    const { data } = await db.from("follows").select("followee_user_id").eq("follower_user_id", userId).limit(2000);
    return [`u:${userId}`, ...((data ?? []) as { followee_user_id: string }[]).map((r) => `u:${r.followee_user_id}`)];
  }
  const { data: mine } = await db.from("community_crew_members").select("community_id").eq("user_id", userId);
  const comms = [...new Set(((mine ?? []) as { community_id: string }[]).map((r) => r.community_id))];
  if (!comms.length) return [`u:${userId}`];
  const { data: members } = await db.from("community_crew_members").select("user_id").in("community_id", comms).limit(5000);
  return [...new Set([userId, ...((members ?? []) as { user_id: string }[]).map((r) => r.user_id)])].map((id) => `u:${id}`);
}

type BoardRaw = { player: string; time_id: string; time_ms: number; proof_kind: ProofKind; proof_url: string | null; source: string; created_at: string; vehicle: TtVehicle; video_status: VideoState; video_url: string | null };

async function verificationsFor(timeIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!timeIds.length) return out;
  const { data } = await createServiceClient().from("tt_verifications").select("time_id, guild_name").in("time_id", timeIds);
  for (const r of (data ?? []) as { time_id: string; guild_name: string | null }[]) {
    const list = out.get(r.time_id) ?? [];
    list.push(r.guild_name || "a Discord server");
    out.set(r.time_id, list);
  }
  return out;
}

/**
 * A track's board in a scope, for one items setting and vehicle board: every time in its place, each
 * marked Verified or Unverified (`video`), and `mine` the viewer's row when it's further down than `limit`.
 */
export async function boardFor(args: { game: TtGame; track: string; cc: TtClass; items?: TtItems; vehicle?: TtVehicle; scope: TtScope; viewer: TtPlayer | null; guildId?: string | null; proofOnly?: boolean; verifiedOnly?: boolean; limit?: number }): Promise<TtBoard> {
  const items: TtItems = args.items ?? "shrooms";
  const vehicle: TtVehicle = args.game === "mk8dx" ? args.vehicle ?? "any" : "any";
  const empty: TtBoard = { game: args.game, track: args.track, cc: args.cc, items, vehicle, scope: args.scope, proofOnly: !!args.proofOnly, verifiedOnly: !!args.verifiedOnly, rows: [], mine: null, total: 0 };
  if (!(await ttReady())) return empty;
  const players = await scopePlayers(args.scope, args.viewer, args.guildId ?? null);
  if (players && !players.length) return empty;
  const { data, error } = await createServiceClient().rpc("tt_board2", {
    p_game: args.game, p_track: args.track, p_cc: args.cc, p_items: items, p_vehicle: vehicle, p_players: players, p_proof: !!args.proofOnly, p_limit: 500,
  });
  if (error) { console.error("[tt] board failed:", error.message); return empty; }
  const raw = ((data ?? []) as BoardRaw[]).map((r) => ({ ...r, timeMs: r.time_ms, video: (r.video_status ?? "none") as VideoState }))
    .filter((r) => !args.verifiedOnly || r.video === "checked");
  const placed = rankRows(raw);
  // Only the top ten for everyone need a clip, so a friends or server view still asks the whole board.
  const top = args.scope === "everyone" && !args.verifiedOnly
    ? new Set(placed.filter((r) => r.rank <= TOP_TEN).map((r) => r.row.time_id))
    : await topTenIds(args.game, args.track, args.cc, items, vehicle);
  const limit = args.limit ?? 100;
  const shown = placed.slice(0, limit);
  const mineRaw = args.viewer ? placed.find((r) => r.row.player === args.viewer) ?? null : null;
  const need = [...shown.map((r) => r.row), ...(mineRaw && !shown.includes(mineRaw) ? [mineRaw.row] : [])];
  const [names, verified] = await Promise.all([
    describePlayers(need.map((r) => r.player)),
    verificationsFor(need.map((r) => r.time_id)),
  ]);
  const toRow = (rank: number, r: (typeof raw)[number]): TtBoardRow => {
    const who = names.get(r.player);
    return {
      rank,
      player: r.player,
      name: who?.name ?? "A player",
      avatar: who?.avatar ?? null,
      profile: who?.profile ?? null,
      discord: who?.tag === "discord",
      timeId: r.time_id,
      timeMs: r.time_ms,
      proof: r.proof_kind,
      proofUrl: r.proof_url,
      verifiedIn: verified.get(r.time_id) ?? [],
      at: r.created_at,
      you: !!args.viewer && r.player === args.viewer,
      vehicle: r.vehicle ?? "any",
      video: r.video,
      videoUrl: r.video_url,
      imported: r.source === "import",
      page: playerPagePath(r.player, who?.profile ?? null),
      top: top.has(r.time_id),
    };
  };
  return {
    ...empty,
    rows: shown.map((r) => toRow(r.rank, r.row)),
    mine: mineRaw && !shown.includes(mineRaw) ? toRow(mineRaw.rank, mineRaw.row) : null,
    total: raw.length,
  };
}

/** The time ids in a board's top ten for everyone (ties at tenth all count). */
export async function topTenIds(game: TtGame, track: string, cc: TtClass, items: TtItems, vehicle: TtVehicle): Promise<Set<string>> {
  const { data, error } = await createServiceClient().rpc("tt_board2", {
    p_game: game, p_track: track, p_cc: cc, p_items: items, p_vehicle: game === "mk8dx" ? vehicle : "any", p_players: null, p_proof: false, p_limit: 40,
  });
  if (error) return new Set();
  const raw = ((data ?? []) as BoardRaw[]).map((r) => ({ ...r, timeMs: r.time_ms }));
  return new Set(rankRows(raw).filter((r) => r.rank <= TOP_TEN).map((r) => r.row.time_id));
}

/** The boards a time sits on: the open board, and its vehicle board when it has one. */
function boardsOf(t: { game: TtGame; vehicle: TtVehicle }): TtVehicle[] {
  return t.game === "mk8dx" && t.vehicle !== "any" ? ["any", t.vehicle] : ["any"];
}

/** Each of a time's boards' top tens, taken before the time comes off so `nudgeMovedUp` can tell who moved in. */
export async function topTensAround(t: { game: TtGame; track: string; cc: TtClass; items: TtItems; vehicle: TtVehicle }): Promise<Map<TtVehicle, Set<string>>> {
  const out = new Map<TtVehicle, Set<string>>();
  for (const v of boardsOf(t)) out.set(v, await topTenIds(t.game, t.track, t.cc, t.items, v));
  return out;
}

/**
 * After a time comes off a board, whoever moved up into its top ten is asked once for a clip (round 2
 * tightening, 1A). Only accounts get the note; a time already checked or with a clip waiting is left alone.
 */
export async function nudgeMovedUp(t: { game: TtGame; track: string; cc: TtClass; items: TtItems; vehicle: TtVehicle }, before: Map<TtVehicle, Set<string>>): Promise<void> {
  const fresh = new Set<string>();
  for (const v of boardsOf(t)) {
    const was = before.get(v) ?? new Set<string>();
    for (const id of await topTenIds(t.game, t.track, t.cc, t.items, v)) if (!was.has(id)) fresh.add(id);
  }
  if (!fresh.size) return;
  const { data } = await createServiceClient().from("tt_times").select("id, user_id, time_ms, vehicle, video_status").in("id", [...fresh]);
  const track = ttTrack(t.game, t.track);
  for (const r of (data ?? []) as { id: string; user_id: string | null; time_ms: number; vehicle: TtVehicle; video_status: VideoState }[]) {
    if (!r.user_id || r.video_status === "checked" || r.video_status === "waiting" || !track) continue;
    const what = categoryText(t.game, t.cc, t.items, r.vehicle, TT_GAMES[t.game].classes.length > 1);
    await createNotification({
      userId: r.user_id,
      type: "system",
      title: "Your time moved into the top ten",
      message: `${track.name} (${what}), ${formatTime(r.time_ms)}. Top-ten times need a clip of the run's last 30 seconds to show as Verified.`.slice(0, 300),
      link: trackPath(track, t.cc, { items: t.items, vehicle: r.vehicle }),
    }).catch(() => undefined);
  }
}

export interface TtBest {
  game: TtGame;
  track: string;
  cc: TtClass;
  items: TtItems;
  /** The board: "any" is the open board (the player's best with any vehicle), else that vehicle board. */
  vehicle: TtVehicle;
  timeId: string;
  timeMs: number;
  proof: ProofKind;
  proofUrl: string | null;
  video: VideoState;
  at: string;
  place: number;
  total: number;
}

/** A player's best on every board they have a time on, fastest place first. */
export async function playerBests(player: TtPlayer): Promise<TtBest[]> {
  if (!(await ttReady())) return [];
  const { data, error } = await createServiceClient().rpc("tt_player_bests2", { p_players: [player] });
  if (error) { console.error("[tt] bests failed:", error.message); return []; }
  type Raw = { game: TtGame; track: string; cc: TtClass; items: TtItems; vehicle: TtVehicle; time_id: string; time_ms: number; proof_kind: ProofKind; proof_url: string | null; created_at: string; video_status: VideoState; place: number; total: number };
  return ((data ?? []) as Raw[])
    .filter((r) => ttTrack(r.game, r.track))
    .map((r) => ({ game: r.game, track: r.track, cc: Number(r.cc) as TtClass, items: r.items, vehicle: r.vehicle, timeId: r.time_id, timeMs: r.time_ms, proof: r.proof_kind, proofUrl: r.proof_url, video: r.video_status ?? "none", at: r.created_at, place: r.place, total: r.total }))
    .sort((a, b) => a.place - b.place || a.total - b.total);
}

export interface TtTrackSummary { track: string; cc: TtClass; recordMs: number; recordPlayer: string; players: number;
  /** Whether the record's video has been checked (an unchecked record is still waiting for its video). */
  recordChecked: boolean }

/** Per track and class, for one items setting and board: the record and how many players have a time. */
export async function trackSummary(game: TtGame, items: TtItems = "shrooms", vehicle: TtVehicle = "any"): Promise<TtTrackSummary[]> {
  if (!(await ttReady())) return [];
  const db = createServiceClient();
  const v = game === "mk8dx" ? vehicle : "any";
  let checkedQ = db.from("tt_times").select("track, cc, player, time_ms").eq("game", game).eq("items", items).eq("status", "ok").eq("video_status", "checked");
  if (v !== "any") checkedQ = checkedQ.eq("vehicle", v);
  const [{ data, error }, { data: checked }] = await Promise.all([
    db.rpc("tt_track_summary2", { p_game: game, p_items: items, p_vehicle: v }),
    checkedQ.limit(5000),
  ]);
  if (error) return [];
  const ok = new Set(((checked ?? []) as { track: string; cc: number; player: string; time_ms: number }[]).map((r) => `${r.track}|${r.cc}|${r.player}|${r.time_ms}`));
  return ((data ?? []) as { track: string; cc: number; record_ms: number; record_player: string; players: number }[])
    .map((r) => ({ track: r.track, cc: Number(r.cc) as TtClass, recordMs: r.record_ms, recordPlayer: r.record_player, players: r.players, recordChecked: ok.has(`${r.track}|${r.cc}|${r.record_player}|${r.record_ms}`) }));
}

/** A player's own time, removed by them (it stays in the database as removed). */
export async function removeOwnTime(player: TtPlayer, timeId: string): Promise<boolean> {
  if (!(await ttReady())) return false;
  const { data } = await createServiceClient().from("tt_times")
    .update({ status: "removed", removed_reason: "removed by the player", removed_at: new Date().toISOString() })
    .eq("id", timeId).eq("player", player).eq("status", "ok").select("id");
  return !!(data && data.length);
}

export interface TtTimeRow {
  id: string; player: string; userId: string | null; game: TtGame; track: string; cc: TtClass; items: TtItems; vehicle: TtVehicle; timeMs: number; proof: ProofKind; proofUrl: string | null;
  video: VideoState; videoUrl: string | null; videoNote: string | null; source: string; at: string; status: "ok" | "removed"; createdAt: string;
}

export const TIME_COLS = "id, player, user_id, game, track, cc, items, vehicle, time_ms, proof_kind, proof_url, video_status, video_url, video_note, source, status, created_at";
type TimeRaw = { id: string; player: string; user_id: string | null; game: TtGame; track: string; cc: number; items: TtItems; vehicle: TtVehicle; time_ms: number; proof_kind: ProofKind; proof_url: string | null; video_status: VideoState; video_url: string | null; video_note: string | null; source: string; status: "ok" | "removed"; created_at: string };
export function toTimeRow(r: TimeRaw): TtTimeRow {
  return { id: r.id, player: r.player, userId: r.user_id, game: r.game, track: r.track, cc: Number(r.cc) as TtClass, items: r.items ?? "shrooms", vehicle: r.vehicle ?? "any", timeMs: r.time_ms, proof: r.proof_kind, proofUrl: r.proof_url,
    video: r.video_status ?? "none", videoUrl: r.video_url, videoNote: r.video_note, source: r.source, at: r.created_at, status: r.status, createdAt: r.created_at };
}

export async function timeById(id: string): Promise<TtTimeRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await ttReady())) return null;
  const { data } = await createServiceClient().from("tt_times").select(TIME_COLS).eq("id", id).maybeSingle();
  return data ? toTimeRow(data as TimeRaw) : null;
}

/** The player adds (or swaps) the clip of their run's last 30 seconds; a reviewer checks it (4A). */
export async function setVideo(player: TtPlayer, timeId: string, url: string): Promise<boolean> {
  if (!(await ttReady())) return false;
  const { data } = await createServiceClient().from("tt_times")
    .update({ video_url: url, video_status: "waiting", video_note: null, video_checked_by: null, video_checked_at: null })
    .eq("id", timeId).eq("player", player).eq("status", "ok").neq("video_status", "checked").select("id");
  return !!(data && data.length);
}

/** A Discord server's mods vouch for a time. */
export async function verifyTime(timeId: string, guildId: string, guildName: string | null, by: string): Promise<boolean> {
  const t = await timeById(timeId);
  if (!t || t.status !== "ok") return false;
  await createServiceClient().from("tt_verifications").upsert(
    { time_id: timeId, guild_id: guildId, guild_name: guildName, verified_by: by },
    { onConflict: "time_id,guild_id", ignoreDuplicates: true },
  );
  return true;
}

/** After someone links Discord to their account: their Discord-only times move to the account. */
export async function claimDiscordTimes(userId: string, discordId: string | null): Promise<number> {
  if (!discordId || !(await ttReady())) return 0;
  const db = createServiceClient();
  const { data } = await db.from("gs_identities").select("id").eq("platform", "discord").eq("platform_id", discordId).maybeSingle();
  const identityId = (data as { id: string } | null)?.id;
  if (!identityId) return 0;
  const { data: moved, error } = await db.rpc("tt_claim_identity", { p_user: userId, p_identity: identityId });
  if (error) { console.error("[tt] claim failed:", error.message); return 0; }
  return Number(moved ?? 0);
}

/** Players whose names match, for the hub's search: accounts and Discord players with at least one time. */
export async function findPlayers(q: string, limit = 8): Promise<{ player: string; name: string; avatar: string | null; profile: string | null; discord: boolean }[]> {
  const text = q.trim().replace(/[%_,()]/g, " ").trim();
  if (text.length < 2 || !(await ttReady())) return [];
  const db = createServiceClient();
  const [u, i] = await Promise.all([
    db.from("users").select("id").eq("is_public", true).or(`display_name.ilike.%${text}%,username.ilike.%${text}%`).limit(40),
    db.from("gs_identities").select("id").eq("platform", "discord").is("gs_account_id", null).ilike("display_name", `%${text}%`).limit(40),
  ]);
  const keys = [
    ...((u.data ?? []) as { id: string }[]).map((r) => `u:${r.id}`),
    ...((i.data ?? []) as { id: string }[]).map((r) => `i:${r.id}`),
  ];
  if (!keys.length) return [];
  const { data: having } = await db.from("tt_times").select("player").in("player", keys).eq("status", "ok").limit(2000);
  const withTimes = [...new Set(((having ?? []) as { player: string }[]).map((r) => r.player))].slice(0, limit);
  const names = await describePlayers(withTimes);
  return withTimes.map((p) => {
    const who = names.get(p);
    return { player: p, name: who?.name ?? "A player", avatar: who?.avatar ?? null, profile: who?.profile ?? null, discord: who?.tag === "discord" };
  });
}
