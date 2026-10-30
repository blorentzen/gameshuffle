import "server-only";

/**
 * Time trials (server). Adding times, boards by scope, a player's bests, reports,
 * Discord server verification and the players each server has seen. Every read
 * and write goes through the service role (supabase/time-trials-m1.sql); until
 * that runs, reads come back empty and writes say `not_ready`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { rankRows, type ProofKind, type TtPlayer } from "./rules";
import { isClassFor, ttTrack, type TtClass, type TtGame } from "./tracks";
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
}

export interface TtBoard {
  game: TtGame;
  track: string;
  cc: TtClass;
  scope: TtScope;
  proofOnly: boolean;
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
  timeMs: number;
  proof: ProofKind;
  proofUrl: string | null;
  readByAi: boolean;
  source: "site" | "discord" | "import";
  guildId?: string | null;
}

export type AddTimeResult =
  | { ok: true; timeId: string; best: boolean; previousMs: number | null; place: number; total: number; server: { place: number; total: number } | null; again: boolean }
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

async function previousBest(player: string, game: TtGame, track: string, cc: TtClass): Promise<number | null> {
  const { data } = await createServiceClient().from("tt_times").select("time_ms")
    .eq("player", player).eq("game", game).eq("track", track).eq("cc", cc).eq("status", "ok")
    .order("time_ms", { ascending: true }).limit(1).maybeSingle();
  return (data as { time_ms: number } | null)?.time_ms ?? null;
}

async function placeOf(game: TtGame, track: string, cc: TtClass, timeMs: number, player: string, players: string[] | null): Promise<{ place: number; total: number }> {
  const { data } = await createServiceClient().rpc("tt_place", { p_game: game, p_track: track, p_cc: cc, p_time_ms: timeMs, p_player: player, p_players: players });
  const row = (Array.isArray(data) ? data[0] : data) as { place: number; total: number } | undefined;
  return { place: row?.place ?? 1, total: row?.total ?? 1 };
}

/** Saves a time. The same time on the same track within ten minutes is the first one again (a double tap or a retried command). */
export async function addTime(input: AddTimeInput): Promise<AddTimeResult> {
  if (!(await ttReady())) return { ok: false, error: "not_ready" };
  if (!ttTrack(input.game, input.track)) return { ok: false, error: "bad_track" };
  if (!isClassFor(input.game, input.cc)) return { ok: false, error: "bad_class" };
  if (fasterThanRecord(input.game, input.track, input.cc, input.timeMs)) return { ok: false, error: "faster_than_record" };
  const db = createServiceClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dupe } = await db.from("tt_times").select("id").eq("player", input.player).eq("game", input.game)
    .eq("track", input.track).eq("cc", input.cc).eq("time_ms", input.timeMs).eq("status", "ok").gte("created_at", since).limit(1).maybeSingle();
  const previousMs = await previousBest(input.player, input.game, input.track, input.cc);
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
  const [place, server] = await Promise.all([
    placeOf(input.game, input.track, input.cc, bestMs, input.player, null),
    input.guildId ? guildPlayers(input.guildId).then((ps) => placeOf(input.game, input.track, input.cc, bestMs, input.player, ps)) : Promise.resolve(null),
  ]);
  return { ok: true, timeId, best, previousMs: again ? null : previousMs, place: place.place, total: place.total, server, again };
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

type BoardRaw = { player: string; time_id: string; time_ms: number; proof_kind: ProofKind; proof_url: string | null; source: string; created_at: string };

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

/** A track's board in a scope. `limit` rows, plus the viewer's own row when it's further down. */
export async function boardFor(args: { game: TtGame; track: string; cc: TtClass; scope: TtScope; viewer: TtPlayer | null; guildId?: string | null; proofOnly?: boolean; limit?: number }): Promise<TtBoard> {
  const empty: TtBoard = { game: args.game, track: args.track, cc: args.cc, scope: args.scope, proofOnly: !!args.proofOnly, rows: [], mine: null, total: 0 };
  if (!(await ttReady())) return empty;
  const players = await scopePlayers(args.scope, args.viewer, args.guildId ?? null);
  if (players && !players.length) return empty;
  const { data, error } = await createServiceClient().rpc("tt_board", {
    p_game: args.game, p_track: args.track, p_cc: args.cc, p_players: players, p_proof: !!args.proofOnly, p_limit: 500,
  });
  if (error) { console.error("[tt] board failed:", error.message); return empty; }
  const all = rankRows(((data ?? []) as BoardRaw[]).map((r) => ({ ...r, timeMs: r.time_ms })));
  const limit = args.limit ?? 100;
  const shown = all.slice(0, limit);
  const mineRaw = args.viewer ? all.find((r) => r.row.player === args.viewer) ?? null : null;
  const need = [...shown, ...(mineRaw && !shown.includes(mineRaw) ? [mineRaw] : [])];
  const [names, verified] = await Promise.all([
    describePlayers(need.map((r) => r.row.player)),
    verificationsFor(need.map((r) => r.row.time_id)),
  ]);
  const toRow = (r: (typeof all)[number]): TtBoardRow => {
    const who = names.get(r.row.player);
    return {
      rank: r.rank,
      player: r.row.player,
      name: who?.name ?? "A player",
      avatar: who?.avatar ?? null,
      profile: who?.profile ?? null,
      discord: who?.tag === "discord",
      timeId: r.row.time_id,
      timeMs: r.row.time_ms,
      proof: r.row.proof_kind,
      proofUrl: r.row.proof_url,
      verifiedIn: verified.get(r.row.time_id) ?? [],
      at: r.row.created_at,
      you: !!args.viewer && r.row.player === args.viewer,
    };
  };
  return {
    ...empty,
    rows: shown.map(toRow),
    mine: mineRaw && !shown.includes(mineRaw) ? toRow(mineRaw) : null,
    total: all.length,
  };
}

export interface TtBest {
  game: TtGame;
  track: string;
  cc: TtClass;
  timeId: string;
  timeMs: number;
  proof: ProofKind;
  proofUrl: string | null;
  at: string;
  place: number;
  total: number;
}

/** A player's best on every track they've run, fastest place first. */
export async function playerBests(player: TtPlayer): Promise<TtBest[]> {
  if (!(await ttReady())) return [];
  const { data, error } = await createServiceClient().rpc("tt_player_bests", { p_players: [player] });
  if (error) { console.error("[tt] bests failed:", error.message); return []; }
  type Raw = { game: TtGame; track: string; cc: TtClass; time_id: string; time_ms: number; proof_kind: ProofKind; proof_url: string | null; created_at: string; place: number; total: number };
  return ((data ?? []) as Raw[])
    .filter((r) => ttTrack(r.game, r.track))
    .map((r) => ({ game: r.game, track: r.track, cc: Number(r.cc) as TtClass, timeId: r.time_id, timeMs: r.time_ms, proof: r.proof_kind, proofUrl: r.proof_url, at: r.created_at, place: r.place, total: r.total }))
    .sort((a, b) => a.place - b.place || a.total - b.total);
}

export interface TtTrackSummary { track: string; cc: TtClass; recordMs: number; recordPlayer: string; players: number }

/** Per track and class: the record and how many players have a time. */
export async function trackSummary(game: TtGame): Promise<TtTrackSummary[]> {
  if (!(await ttReady())) return [];
  const { data, error } = await createServiceClient().rpc("tt_track_summary", { p_game: game });
  if (error) return [];
  return ((data ?? []) as { track: string; cc: number; record_ms: number; record_player: string; players: number }[])
    .map((r) => ({ track: r.track, cc: Number(r.cc) as TtClass, recordMs: r.record_ms, recordPlayer: r.record_player, players: r.players }));
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
  id: string; player: string; game: TtGame; track: string; cc: TtClass; timeMs: number; proof: ProofKind; proofUrl: string | null; at: string; status: "ok" | "removed"; createdAt: string;
}

export async function timeById(id: string): Promise<TtTimeRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await ttReady())) return null;
  const { data } = await createServiceClient().from("tt_times").select("id, player, game, track, cc, time_ms, proof_kind, proof_url, status, created_at").eq("id", id).maybeSingle();
  const r = data as { id: string; player: string; game: TtGame; track: string; cc: number; time_ms: number; proof_kind: ProofKind; proof_url: string | null; status: "ok" | "removed"; created_at: string } | null;
  return r ? { id: r.id, player: r.player, game: r.game, track: r.track, cc: Number(r.cc) as TtClass, timeMs: r.time_ms, proof: r.proof_kind, proofUrl: r.proof_url, at: r.created_at, status: r.status, createdAt: r.created_at } : null;
}

/** Anyone can report a time once. Returns false when it isn't there. */
export async function reportTime(timeId: string, reporter: string, reason: string | null): Promise<boolean> {
  const t = await timeById(timeId);
  if (!t || t.status !== "ok") return false;
  await createServiceClient().from("tt_reports").upsert(
    { time_id: timeId, reporter, reason: reason ? reason.slice(0, 300) : null },
    { onConflict: "time_id,reporter", ignoreDuplicates: true },
  );
  return true;
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

/** Staff: open reports, oldest first, with the time and who sent it. */
export async function openReports(limit = 50): Promise<{ id: string; reason: string | null; at: string; reports: number; time: TtTimeRow; name: string }[]> {
  if (!(await ttReady())) return [];
  const db = createServiceClient();
  const { data } = await db.from("tt_reports").select("id, time_id, reason, created_at").is("resolved_at", null).order("created_at").limit(500);
  const rows = (data ?? []) as { id: string; time_id: string; reason: string | null; created_at: string }[];
  const byTime = new Map<string, { id: string; reason: string | null; at: string; reports: number }>();
  for (const r of rows) {
    const had = byTime.get(r.time_id);
    if (had) { had.reports++; if (!had.reason && r.reason) had.reason = r.reason; }
    else byTime.set(r.time_id, { id: r.id, reason: r.reason, at: r.created_at, reports: 1 });
  }
  const ids = [...byTime.keys()].slice(0, limit);
  if (!ids.length) return [];
  const { data: times } = await db.from("tt_times").select("id, player, game, track, cc, time_ms, proof_kind, proof_url, status, created_at").in("id", ids);
  const list = ((times ?? []) as { id: string; player: string; game: TtGame; track: string; cc: number; time_ms: number; proof_kind: ProofKind; proof_url: string | null; status: "ok" | "removed"; created_at: string }[])
    .map((r): TtTimeRow => ({ id: r.id, player: r.player, game: r.game, track: r.track, cc: Number(r.cc) as TtClass, timeMs: r.time_ms, proof: r.proof_kind, proofUrl: r.proof_url, at: r.created_at, status: r.status, createdAt: r.created_at }));
  const names = await describePlayers(list.map((t) => t.player));
  return list.map((time) => ({ ...byTime.get(time.id)!, time, name: names.get(time.player)?.name ?? "A player" }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Staff: keep a reported time (closes its reports) or remove it. */
export async function resolveReports(timeId: string, outcome: "kept" | "removed", staffId: string): Promise<boolean> {
  if (!(await ttReady())) return false;
  const db = createServiceClient();
  const now = new Date().toISOString();
  if (outcome === "removed") {
    await db.from("tt_times").update({ status: "removed", removed_reason: "removed after a report", removed_by: staffId, removed_at: now }).eq("id", timeId);
  }
  const { data } = await db.from("tt_reports").update({ resolved_at: now, resolved_by: staffId, outcome }).eq("time_id", timeId).is("resolved_at", null).select("id");
  return !!(data && data.length);
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
