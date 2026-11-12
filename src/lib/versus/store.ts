import "server-only";

/**
 * Head-to-head rooms (server; speedrun races picks 2026-11-10, all as recommended): the record in `versus_rooms` and
 * `versus_entrants` (supabase/versus-m1.sql), kept in step with the live room on the relay (./relay.ts). The site
 * owns who's in and who's ready; the relay's room owns the race once it starts and posts back here
 * (`recordRoomEvent`, from /api/versus/relay).
 *
 * Who races (pick 1A): any account with a speedrun setup, by the room's link; a host can make it invite only. One live
 * room per runner, since a runner's relay can only be in one room. 2 to 8 runners (pick 7A); the host starts once at
 * least two are ready, and anyone not ready is taken out. Before the migration runs, `versusReady()` is false and the
 * race screens stay hidden.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { gameName } from "@/lib/speedrun/store";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import { COUNTDOWN_S, SEED_GAMES, VERSUS_MIN, battleGroupLabel, cleanSeed, cleanVersusSettings, finalResults, isBattleGroup, roomCode, speedrunReadiness, type ReadyProblem } from "./rules";
import { roomCancel, roomEnd, roomRead, roomSetup, roomStart, roomTakeOut, roomWatchUrl, type RoomCallResult, type RoomSetup } from "./relay";
import { speedrunEntries, speedrunEntry } from "./speedrun";
import { duelInfo, duelSetupFor, duelTrainer, playDuel } from "./duel";
import { battleGroupOf, battleReady, battleTeam, forfeitBattle, startBattleRoom, teamView } from "./battle";
import { leaveTag, startTagRoom } from "./tag";
import { BRING } from "@/lib/originals/duel/battle";
import type { DuelRunView } from "@/lib/originals/duel/view";
import type { DuelLevel } from "@/lib/originals/duel/types";
import type {
  EntrantStatus, MyRace, RoomHookBody, RoomStatus, RoomView, VersusEntrantView, VersusKind, VersusRoomView, VersusSettings,
} from "./types";

const ROOM_COLS = "id, code, room_key, kind, host_user_id, game, category, checkpoints, settings, status, starts_at, started_at, finished_at, result, next_code, created_at";
const ENTRANT_COLS = "room_id, user_id, seat, status, source, place, final_ms, reached, out_reason, joined_at";

export interface RoomRow {
  id: string; code: string; room_key: string; kind: VersusKind; host_user_id: string; game: string | null; category: string | null;
  checkpoints: unknown; settings: unknown; status: RoomStatus; starts_at: string | null; started_at: string | null;
  finished_at: string | null; result: unknown; next_code: string | null; created_at: string;
}
interface EntrantRow {
  room_id: string; user_id: string; seat: number; status: EntrantStatus; source: { relayId?: string; team?: string; runId?: string; squad?: number } | null;
  place: number | null; final_ms: number | null; reached: number | null; out_reason: string | null; joined_at: string;
}

/** Entrants in the room's lanes (invited people and anyone who left or was taken out before the start aren't). */
const IN_LANES: EntrantStatus[] = ["joined", "ready", "racing", "done", "out"];
/** Still holding a seat in a room that's going. */
const HOLDING: EntrantStatus[] = ["joined", "ready", "racing"];
const LIVE_ROOM: RoomStatus[] = ["open", "countdown", "running"];

const db = () => createServiceClient();
const checkpointsOf = (r: RoomRow): string[] => (Array.isArray(r.checkpoints) ? (r.checkpoints as unknown[]).filter((x): x is string => typeof x === "string") : []);
const titleOf = (r: RoomRow) => {
  if (r.kind === "duel") {
    const t = duelTrainer(cleanVersusSettings(r.settings).duel?.trainerId ?? "");
    return t ? `Duel: ${t.name}` : "Duel";
  }
  if (r.kind === "battle") return `Trainer battle: ${battleGroupLabel(battleGroupOf(r))}`;
  if (r.kind === "tag") {
    const t = duelTrainer(cleanVersusSettings(r.settings).duel?.trainerId ?? "");
    return t ? `Tag team vs ${t.name}` : "Tag team";
  }
  return [gameName(r.game), r.category].filter(Boolean).join(" · ") || "Speedrun race";
};
const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);

// ---- Ready ---------------------------------------------------------------------------------------------------

let readyYes = false;
let readyNoAt = 0;
/** The tables exist (a yes is kept; a no is asked again after a minute). */
export async function versusReady(): Promise<boolean> {
  if (readyYes) return true;
  if (Date.now() - readyNoAt < 60_000) return false;
  const { error } = await db().from("versus_rooms").select("id").limit(1);
  if (!error) return (readyYes = true);
  if (!/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`)) console.warn("[versus] ready check:", error.message);
  readyNoAt = Date.now();
  return false;
}

// ---- Reads ---------------------------------------------------------------------------------------------------

export async function roomByCode(code: string): Promise<RoomRow | null> {
  const { data } = await db().from("versus_rooms").select(ROOM_COLS).eq("code", code).maybeSingle();
  return (data as RoomRow | null) ?? null;
}

async function roomByKey(key: string): Promise<RoomRow | null> {
  const { data } = await db().from("versus_rooms").select(ROOM_COLS).eq("room_key", key).maybeSingle();
  return (data as RoomRow | null) ?? null;
}

async function entrantsOf(roomId: string): Promise<EntrantRow[]> {
  const { data } = await db().from("versus_entrants").select(ENTRANT_COLS).eq("room_id", roomId).order("seat");
  return (data ?? []) as EntrantRow[];
}

async function people(ids: string[]): Promise<Map<string, { name: string; avatar: string | null; username: string | null }>> {
  const out = new Map<string, { name: string; avatar: string | null; username: string | null }>();
  if (!ids.length) return out;
  const { data, error } = await db().from("users").select("id, display_name, username, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", ids);
  if (error) console.warn("[versus] names:", error.message);
  for (const u of (data ?? []) as (AccountRow & { display_name: string | null; username: string | null })[]) {
    out.set(u.id, { name: (u.display_name || u.username || "Runner").slice(0, 40), avatar: accountAvatar(u), username: u.username });
  }
  return out;
}

/** The live room this runner holds a seat in, other than `except`. */
async function liveRoomOf(userId: string, except?: string): Promise<{ code: string } | null> {
  const { data } = await db().from("versus_entrants").select("room_id, status, versus_rooms!inner(code, status)")
    .eq("user_id", userId).in("status", HOLDING).in("versus_rooms.status", LIVE_ROOM).limit(5);
  const rows = (data ?? []) as unknown as { room_id: string; versus_rooms: { code: string } | { code: string }[] }[];
  const hit = rows.find((r) => r.room_id !== except);
  if (!hit) return null;
  const room = Array.isArray(hit.versus_rooms) ? hit.versus_rooms[0] : hit.versus_rooms;
  return room ? { code: room.code } : null;
}

// ---- The relay's room ----------------------------------------------------------------------------------------

/** Sends the room's whole config to the relay (every change sends all of it, so a missed call catches up). */
export async function syncRoom(room: RoomRow): Promise<RoomCallResult> {
  const rows = (await entrantsOf(room.id)).filter((e) => IN_LANES.includes(e.status));
  const [names, setups] = await Promise.all([people(rows.map((e) => e.user_id)), speedrunEntries(rows.map((e) => e.user_id))]);
  // Duels and battles: the site feeds the lanes, counted in turns.
  const duel = room.kind !== "speedrun";
  return roomSetup(room.room_key, {
    kind: room.kind,
    title: titleOf(room),
    checkpoints: checkpointsOf(room),
    unit: duel ? "turns" : "ms",
    configVersion: Date.now(),
    entrants: rows.flatMap((e): RoomSetup["entrants"] => {
      // A duel's lanes come from the site; a streamer's lane still waits out their stream delay.
      if (duel) {
        return [{ key: e.user_id, name: names.get(e.user_id)?.name ?? "Player", color: null, source: "site" as const, relayId: null, delayMs: setups.get(e.user_id)?.delayMs ?? 0, ready: e.status === "ready" }];
      }
      const relayId = e.source?.relayId ?? setups.get(e.user_id)?.relayId;
      if (!relayId) return [];
      return [{
        key: e.user_id, name: names.get(e.user_id)?.name ?? "Runner", color: null, source: "relay" as const, relayId,
        delayMs: setups.get(e.user_id)?.delayMs ?? 5000, ready: e.status === "ready",
      }];
    }),
  });
}

// ---- Making a race -------------------------------------------------------------------------------------------

export type VersusError =
  | "not_ready" | "signin" | "setup" | "no_splits" | "elsewhere" | "not_found" | "closed" | "full" | "invite" | "host_only"
  | "host_stays" | "lane" | "need_two" | "relay" | "no_user" | "already_in" | "not_running" | "failed" | "teams";

export type VersusResult<T = object> = ({ ok: true } & T) | { ok: false; error: VersusError; detail?: string; problem?: ReadyProblem };

/** A new race from the host's speedrun setup (their game, category and splits), or a duel on a Trainer Road team
 *  (`kind: "duel"`, `trainerId`, `level`). The host is in it. */
export async function createRace(hostId: string, raw: unknown): Promise<VersusResult<{ code: string }>> {
  if (!(await versusReady())) return { ok: false, error: "not_ready" };
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.kind === "duel" || r.kind === "tag") return createDuel(hostId, r);
  if (r.kind === "battle") return createBattle(hostId, r);
  const entry = await speedrunEntry(hostId);
  if (!entry) return { ok: false, error: "setup" };
  if (!entry.splits.length) return { ok: false, error: "no_splits" };
  const elsewhere = await liveRoomOf(hostId);
  if (elsewhere) return { ok: false, error: "elsewhere", detail: elsewhere.code };
  const settings = cleanVersusSettings({ ...r, seed: undefined });
  // A seed everyone plays (Minecraft): GameShuffle picks one (any 64-bit seed), or the host's typed one.
  if (entry.game && SEED_GAMES.has(entry.game)) {
    if (r.seedMode === "pick") settings.seed = randomBytes(8).readBigInt64BE().toString();
    else if (r.seedMode === "typed" && typeof r.seed === "string" && cleanSeed(r.seed)) settings.seed = cleanSeed(r.seed)!;
  }
  let room: RoomRow | null = null;
  for (let i = 0; i < 6 && !room; i++) {
    const { data, error } = await db().from("versus_rooms").insert({
      code: roomCode(entry.gameName), room_key: randomKey(), kind: "speedrun", host_user_id: hostId, game: entry.game,
      category: entry.category || null, checkpoints: entry.splits, settings,
    }).select(ROOM_COLS).maybeSingle();
    if (data) room = data as RoomRow;
    else if (error && error.code !== "23505") { console.error("[versus] create:", error.message); return { ok: false, error: "failed" }; }
  }
  if (!room) return { ok: false, error: "failed" };
  await db().from("versus_entrants").insert({ room_id: room.id, user_id: hostId, seat: 1, status: "joined", source: { relayId: entry.relayId } });
  const synced = await syncRoom(room);
  if (!synced.ok) console.warn(`[versus] new room ${room.code} not on the relay yet: ${synced.error}`);
  return { ok: true, code: room.code };
}

/** A duel room, or a tag team (`kind: "tag"`: two players on one side, always Normal, co-op picks 2026-11-11). */
async function createDuel(hostId: string, r: Record<string, unknown>): Promise<VersusResult<{ code: string }>> {
  const tag = r.kind === "tag";
  if (tag && !(await battleReady())) return { ok: false, error: "not_ready" };
  const level: DuelLevel = tag ? "normal" : r.level === "easy" || r.level === "hard" ? r.level : "normal";
  const setup = await duelSetupFor(typeof r.trainerId === "string" ? r.trainerId : "", level);
  if (!setup.ok) return { ok: false, error: setup.error === "not_found" ? "not_found" : "lane", detail: setup.error };
  const elsewhere = await liveRoomOf(hostId);
  if (elsewhere) return { ok: false, error: "elsewhere", detail: elsewhere.code };
  const settings: VersusSettings = { ...cleanVersusSettings({ ...r, max: tag ? 2 : typeof r.max === "number" ? r.max : 2 }), duel: { trainerId: setup.trainer.id, level, month: setup.month } };
  let room: RoomRow | null = null;
  for (let i = 0; i < 6 && !room; i++) {
    const { data, error } = await db().from("versus_rooms").insert({
      code: roomCode(tag ? "Tag" : setup.trainer.name), room_key: randomKey(), kind: tag ? "tag" : "duel", host_user_id: hostId, game: null,
      category: null, checkpoints: setup.checkpoints, settings,
    }).select(ROOM_COLS).maybeSingle();
    if (data) room = data as RoomRow;
    else if (error && error.code !== "23505") { console.error("[versus] create duel:", error.message); return { ok: false, error: "failed" }; }
  }
  if (!room) return { ok: false, error: "failed" };
  await db().from("versus_entrants").insert({ room_id: room.id, user_id: hostId, seat: 1, status: "joined", source: {} });
  const synced = await syncRoom(room);
  if (!synced.ok) console.warn(`[versus] new duel ${room.code} not on the relay yet: ${synced.error}`);
  return { ok: true, code: room.code };
}

/**
 * A trainer battle (battle picks 2026-11-11): one against one, both picking a team from the same group. Made from a
 * trainer's page, the group is that trainer's and the host starts with that team picked.
 */
async function createBattle(hostId: string, r: Record<string, unknown>): Promise<VersusResult<{ code: string }>> {
  if (!(await battleReady())) return { ok: false, error: "not_ready" };
  const from = typeof r.trainerId === "string" ? battleTeam(r.trainerId) : null;
  const group = typeof r.group === "string" && isBattleGroup(r.group) ? r.group : from && isBattleGroup(from.tier) ? from.tier : "gym";
  const elsewhere = await liveRoomOf(hostId);
  if (elsewhere) return { ok: false, error: "elsewhere", detail: elsewhere.code };
  const settings = cleanVersusSettings({ ...r, duel: undefined, seed: undefined, battle: { group } });
  const team = from && from.tier === group ? from.id : null;
  let room: RoomRow | null = null;
  for (let i = 0; i < 6 && !room; i++) {
    const { data, error } = await db().from("versus_rooms").insert({
      code: roomCode("Battle"), room_key: randomKey(), kind: "battle", host_user_id: hostId, game: null, category: null,
      checkpoints: Array.from({ length: BRING }, (_, k) => `Knockout ${k + 1}`), settings,
    }).select(ROOM_COLS).maybeSingle();
    if (data) room = data as RoomRow;
    else if (error && error.code !== "23505") { console.error("[versus] create battle:", error.message); return { ok: false, error: "failed" }; }
  }
  if (!room) return { ok: false, error: "failed" };
  await db().from("versus_entrants").insert({ room_id: room.id, user_id: hostId, seat: 1, status: "joined", source: team ? { team } : {} });
  const synced = await syncRoom(room);
  if (!synced.ok) console.warn(`[versus] new battle ${room.code} not on the relay yet: ${synced.error}`);
  return { ok: true, code: room.code };
}

/** A team race: the team a player is on (1 to the room's team count), picked in the lobby. */
async function pickSquad(room: RoomRow, userId: string, squad: number): Promise<VersusResult> {
  const teams = cleanVersusSettings(room.settings).teams;
  if (!teams || !Number.isInteger(squad) || squad < 1 || squad > teams.count) return { ok: false, error: "not_found", detail: "squad" };
  if (room.status !== "open") return { ok: false, error: "closed" };
  const mine = (await entrantsOf(room.id)).find((e) => e.user_id === userId);
  if (!mine || (mine.status !== "joined" && mine.status !== "ready")) return { ok: false, error: "not_found" };
  await db().from("versus_entrants").update({ source: { ...(mine.source ?? {}), squad }, updated_at: new Date().toISOString() }).eq("room_id", room.id).eq("user_id", userId);
  return { ok: true };
}

/** A battle player's team pick in the lobby (hidden from the other player until the start). */
async function pickTeam(room: RoomRow, userId: string, trainerId: string): Promise<VersusResult> {
  if (room.kind !== "battle") return { ok: false, error: "not_found" };
  if (room.status !== "open") return { ok: false, error: "closed" };
  const mine = (await entrantsOf(room.id)).find((e) => e.user_id === userId);
  if (!mine || (mine.status !== "joined" && mine.status !== "ready")) return { ok: false, error: "not_found" };
  const t = battleTeam(trainerId, battleGroupOf(room));
  if (!t) return { ok: false, error: "not_found", detail: "team" };
  await db().from("versus_entrants").update({ source: { ...(mine.source ?? {}), team: t.id }, updated_at: new Date().toISOString() }).eq("room_id", room.id).eq("user_id", userId);
  return { ok: true };
}

function randomKey(): string {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(16), (b) => a[b % a.length]).join("");
}

// ---- The page ------------------------------------------------------------------------------------------------

type JoinBlock = NonNullable<VersusRoomView["me"]>["joinBlock"];

export async function pageView(code: string, viewerId: string | null): Promise<VersusRoomView | null> {
  if (!(await versusReady())) return null;
  const room = await roomByCode(code);
  if (!room) return null;
  const rows = await entrantsOf(room.id);
  const shown = rows.filter((e) => e.status !== "left" && e.status !== "removed");
  const ids = [...new Set([room.host_user_id, ...shown.map((e) => e.user_id)])];
  const [names, setups, liveRes, watchUrl] = await Promise.all([
    people(ids),
    speedrunEntries(shown.map((e) => e.user_id)),
    room.status === "cancelled" ? Promise.resolve(null) : roomRead(room.room_key),
    room.status === "cancelled" ? Promise.resolve(null) : roomWatchUrl(room.room_key),
  ]);
  const live = liveRes && liveRes.ok ? liveRes.room : null;
  const settings = cleanVersusSettings(room.settings);
  const entrants: VersusEntrantView[] = shown.map((e) => ({
    userId: e.user_id, name: names.get(e.user_id)?.name ?? "Runner", avatar: names.get(e.user_id)?.avatar ?? null,
    username: names.get(e.user_id)?.username ?? null, seat: e.seat, status: e.status, pbMs: setups.get(e.user_id)?.pbMs ?? null,
    place: e.place, finalMs: e.final_ms, reached: e.reached, outReason: (e.out_reason as VersusEntrantView["outReason"]) ?? null,
    ...(room.kind === "battle" ? battleEntrant(room, e, viewerId) : {}),
    ...(settings.teams ? { squad: e.source?.squad ?? null } : {}),
  }));
  let me: VersusRoomView["me"] = null;
  if (viewerId) {
    const mine = rows.find((e) => e.user_id === viewerId);
    let joinBlock: JoinBlock = null;
    let elsewhere: string | null = null;
    const holding = mine && (HOLDING.includes(mine.status) || mine.status === "done" || mine.status === "out");
    if (!holding) {
      const seated = rows.filter((e) => e.status === "joined" || e.status === "ready").length;
      if (room.status !== "open") joinBlock = "closed";
      else if (settings.join === "invite" && mine?.status !== "invited") joinBlock = "invite";
      else if (seated >= settings.max) joinBlock = "full";
      else if (room.kind === "speedrun" && !setups.has(viewerId) && !(await speedrunEntry(viewerId))?.splits.length) joinBlock = "setup";
      else {
        const other = await liveRoomOf(viewerId, room.id);
        if (other) { joinBlock = "elsewhere"; elsewhere = other.code; }
      }
    }
    me = { userId: viewerId, status: mine?.status ?? null, isHost: viewerId === room.host_user_id, joinBlock, elsewhere, runId: (mine?.source as { runId?: string } | null)?.runId ?? null };
  }
  const d = settings.duel;
  return {
    code: room.code, kind: room.kind, game: room.kind === "speedrun" ? gameName(room.game) : titleOf(room), gameKey: room.game, category: room.category ?? "",
    checkpoints: checkpointsOf(room), settings, status: room.status,
    host: { userId: room.host_user_id, name: names.get(room.host_user_id)?.name ?? "The host" },
    startsAt: ms(room.starts_at), startedAt: ms(room.started_at), finishedAt: ms(room.finished_at), nextCode: room.next_code,
    entrants, watchUrl, live, me, duel: (room.kind === "duel" || room.kind === "tag") && d ? duelInfo(d.trainerId, d.level, d.month) : null,
    battle: room.kind === "battle" ? { group: battleGroupOf(room), groupLabel: battleGroupLabel(battleGroupOf(room)) } : null,
    // Nobody sees the seed before the countdown (so nobody scouts the world first).
    seed: settings.seed && room.status !== "open" ? settings.seed : null,
  };
}

/** A battle player's team as others may see it: their own always, anyone's once the battle has started. */
function battleEntrant(room: RoomRow, e: EntrantRow, viewerId: string | null): Pick<VersusEntrantView, "teamPicked" | "team"> {
  const t = e.source?.team ? battleTeam(e.source.team) : null;
  const shown = !!t && (e.user_id === viewerId || room.status !== "open");
  return { teamPicked: !!t, team: shown && t ? teamView(t) : null };
}

/** For a runner's OBS overlay: the race they're in now (or finished in the last two minutes). */
export async function overlayRaceFor(userId: string): Promise<{ code: string; watchUrl: string; key: string } | null> {
  if (!(await versusReady())) return null;
  const { data } = await db().from("versus_entrants").select("status, versus_rooms!inner(code, room_key, status, finished_at)")
    .eq("user_id", userId).in("status", ["joined", "ready", "racing", "done", "out"]).order("joined_at", { ascending: false }).limit(3);
  const rows = (data ?? []) as unknown as { versus_rooms: { code: string; room_key: string; status: RoomStatus; finished_at: string | null } | { code: string; room_key: string; status: RoomStatus; finished_at: string | null }[] }[];
  for (const r of rows) {
    const room = Array.isArray(r.versus_rooms) ? r.versus_rooms[0] : r.versus_rooms;
    if (!room) continue;
    const recent = room.status === "finished" && room.finished_at && Date.now() - Date.parse(room.finished_at) < 2 * 60_000;
    if (room.status === "countdown" || room.status === "running" || recent) {
      const watchUrl = await roomWatchUrl(room.room_key);
      return watchUrl ? { code: room.code, watchUrl, key: userId } : null;
    }
  }
  return null;
}

/** A runner's latest races (the speedrun page's "Your races"): newest first, five at most. */
export async function myRaces(userId: string): Promise<MyRace[]> {
  if (!(await versusReady())) return [];
  const { data } = await db().from("versus_entrants").select("status, place, versus_rooms!inner(id, code, game, category, status, host_user_id, created_at)")
    .eq("user_id", userId).not("status", "in", "(left,removed)").order("joined_at", { ascending: false }).limit(5);
  const rows = (data ?? []) as unknown as { place: number | null; versus_rooms: RoomRow | RoomRow[] }[];
  const rooms = rows.map((r) => ({ place: r.place, room: Array.isArray(r.versus_rooms) ? r.versus_rooms[0] : r.versus_rooms })).filter((r) => r.room);
  const counts = new Map<string, number>();
  if (rooms.length) {
    const { data: es } = await db().from("versus_entrants").select("room_id, status").in("room_id", rooms.map((r) => r.room.id));
    for (const e of (es ?? []) as { room_id: string; status: EntrantStatus }[]) if (IN_LANES.includes(e.status)) counts.set(e.room_id, (counts.get(e.room_id) ?? 0) + 1);
  }
  return rooms.map(({ place, room }) => ({
    code: room.code, title: titleOf(room), status: room.status, place, runners: counts.get(room.id) ?? 0, host: room.host_user_id === userId, at: Date.parse(room.created_at),
  }));
}

// ---- What people do on the page ------------------------------------------------------------------------------

export type VersusAction = "join" | "leave" | "ready" | "unready" | "remove" | "invite" | "start" | "end" | "cancel" | "again" | "play" | "team" | "squad";

/** One thing someone does on a race's page. `arg` = the user to take out, or the name to invite. `play` (a duel):
 *  the player's own run, started at Go or picked back up. */
export async function act(code: string, userId: string, action: VersusAction, arg?: string): Promise<VersusResult<{ code?: string; run?: DuelRunView }>> {
  if (!(await versusReady())) return { ok: false, error: "not_ready" };
  const room = await roomByCode(code);
  if (!room) return { ok: false, error: "not_found" };
  const isHost = room.host_user_id === userId;
  const hostOnly: VersusAction[] = ["remove", "invite", "start", "end", "cancel", "again"];
  if (hostOnly.includes(action) && !isHost) return { ok: false, error: "host_only" };
  switch (action) {
    case "join": return join(room, userId);
    case "leave": return leave(room, userId);
    case "ready":
    case "unready": return setReady(room, userId, action === "ready");
    case "remove": return remove(room, arg ?? "");
    case "invite": return invite(room, userId, arg ?? "");
    case "start": return start(room);
    case "end": {
      if (room.status !== "running") return { ok: false, error: "not_running" };
      const r = await roomEnd(room.room_key);
      return r.ok ? { ok: true } : { ok: false, error: "relay", detail: r.error };
    }
    case "cancel": {
      if (room.status !== "open" && room.status !== "countdown") return { ok: false, error: "closed" };
      await roomCancel(room.room_key);
      await db().from("versus_rooms").update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", room.id);
      return { ok: true };
    }
    case "again": return again(room, userId);
    case "team": return pickTeam(room, userId, arg ?? "");
    case "squad": return pickSquad(room, userId, Number(arg));
    case "play": {
      const d = cleanVersusSettings(room.settings).duel;
      if (room.kind !== "duel" || !d) return { ok: false, error: "not_found" };
      const res = await playDuel(room, d, userId);
      if (!res.ok) return { ok: false, error: res.error === "not_running" ? "not_running" : res.error === "not_in" ? "not_found" : "relay", detail: res.error };
      return { ok: true, run: res.run };
    }
    default: return { ok: false, error: "failed" };
  }
}

async function join(room: RoomRow, userId: string): Promise<VersusResult> {
  if (room.status !== "open") return { ok: false, error: "closed" };
  const settings = cleanVersusSettings(room.settings);
  const rows = await entrantsOf(room.id);
  const mine = rows.find((e) => e.user_id === userId);
  if (mine && HOLDING.includes(mine.status)) return { ok: true };
  if (settings.join === "invite" && mine?.status !== "invited") return { ok: false, error: "invite" };
  if (rows.filter((e) => e.status === "joined" || e.status === "ready").length >= settings.max) return { ok: false, error: "full" };
  const entry = room.kind === "speedrun" ? await speedrunEntry(userId) : null;
  if (room.kind === "speedrun" && !entry) return { ok: false, error: "setup" };
  if (entry && !entry.splits.length) return { ok: false, error: "no_splits" };
  const elsewhere = await liveRoomOf(userId, room.id);
  if (elsewhere) return { ok: false, error: "elsewhere", detail: elsewhere.code };
  const used = new Set(rows.filter((e) => e.user_id !== userId && e.status !== "left" && e.status !== "removed").map((e) => e.seat));
  const seat = mine?.seat && !used.has(mine.seat) ? mine.seat : [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s));
  if (!seat) return { ok: false, error: "full" };
  const { error } = await db().from("versus_entrants").upsert({
    room_id: room.id, user_id: userId, seat, status: "joined", source: entry ? { relayId: entry.relayId } : {},
    place: null, final_ms: null, reached: null, out_reason: null, joined_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "room_id,user_id" });
  if (error) { console.error("[versus] join:", error.message); return { ok: false, error: "failed" }; }
  await syncRoom(room);
  return { ok: true };
}

async function leave(room: RoomRow, userId: string): Promise<VersusResult> {
  const mine = (await entrantsOf(room.id)).find((e) => e.user_id === userId);
  if (!mine) return { ok: true };
  if (room.status === "open") {
    if (room.host_user_id === userId) return { ok: false, error: "host_stays" };
    await db().from("versus_entrants").delete().eq("room_id", room.id).eq("user_id", userId);
    await syncRoom(room);
    return { ok: true };
  }
  // A running battle: leaving forfeits it (the other player wins), and the battle tells the room.
  if (room.kind === "battle" && room.status === "running" && (await forfeitBattle(room, userId))) return { ok: true };
  // A running tag duel: leaving loses it for both.
  if (room.kind === "tag" && room.status === "running" && (await leaveTag(room, userId))) return { ok: true };
  if (room.status === "countdown" || room.status === "running") {
    await roomTakeOut(room.room_key, userId, "leave");
    const status: EntrantStatus = room.status === "countdown" ? "left" : "out";
    await db().from("versus_entrants").update({ status, out_reason: "left", updated_at: new Date().toISOString() }).eq("room_id", room.id).eq("user_id", userId).in("status", HOLDING);
  }
  return { ok: true };
}

async function setReady(room: RoomRow, userId: string, ready: boolean): Promise<VersusResult> {
  if (room.status !== "open") return { ok: false, error: "closed" };
  const mine = (await entrantsOf(room.id)).find((e) => e.user_id === userId);
  if (!mine || (mine.status !== "joined" && mine.status !== "ready")) return { ok: false, error: "not_found" };
  // A battle player needs a team first.
  if (ready && room.kind === "battle" && !(mine.source?.team && battleTeam(mine.source.team, battleGroupOf(room)))) return { ok: false, error: "setup", detail: "team" };
  // A speedrun timer must be one GameShuffle can start, with the race's splits, at 0:00. A duel has nothing to check.
  if (ready && room.kind === "speedrun") {
    const live = await roomRead(room.room_key);
    const lane = live.ok ? live.room?.entrants.find((e) => e.key === userId)?.lane ?? null : null;
    const check = speedrunReadiness(lane?.live ?? null, checkpointsOf(room).length);
    if (!check.ok) return { ok: false, error: "lane", problem: check.problem ?? undefined, detail: check.line };
  }
  await db().from("versus_entrants").update({ status: ready ? "ready" : "joined", updated_at: new Date().toISOString() }).eq("room_id", room.id).eq("user_id", userId);
  await syncRoom(room);
  return { ok: true };
}

async function remove(room: RoomRow, target: string): Promise<VersusResult> {
  if (!target || target === room.host_user_id) return { ok: false, error: "host_stays" };
  if (room.status === "open") {
    await db().from("versus_entrants").delete().eq("room_id", room.id).eq("user_id", target);
    await syncRoom(room);
    return { ok: true };
  }
  if (room.status === "countdown" || room.status === "running") {
    await roomTakeOut(room.room_key, target, "remove");
    await db().from("versus_entrants").update({ status: room.status === "countdown" ? "removed" : "out", out_reason: "removed", updated_at: new Date().toISOString() })
      .eq("room_id", room.id).eq("user_id", target).in("status", HOLDING);
    return { ok: true };
  }
  return { ok: false, error: "closed" };
}

async function invite(room: RoomRow, hostId: string, name: string): Promise<VersusResult> {
  if (room.status !== "open") return { ok: false, error: "closed" };
  const handle = name.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_.-]{2,40}$/.test(handle)) return { ok: false, error: "no_user" };
  const { data } = await db().from("users").select("id").eq("username", handle).maybeSingle();
  const target = (data as { id: string } | null)?.id;
  if (!target) return { ok: false, error: "no_user" };
  const rows = await entrantsOf(room.id);
  const mine = rows.find((e) => e.user_id === target);
  if (mine && mine.status !== "left" && mine.status !== "removed") return { ok: false, error: "already_in" };
  const settings = cleanVersusSettings(room.settings);
  const seated = rows.filter((e) => ["invited", "joined", "ready"].includes(e.status));
  if (seated.length >= settings.max) return { ok: false, error: "full" };
  const used = new Set(seated.map((e) => e.seat));
  const seat = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s))!;
  await db().from("versus_entrants").upsert({ room_id: room.id, user_id: target, seat, status: "invited", source: {}, updated_at: new Date().toISOString() }, { onConflict: "room_id,user_id" });
  await createNotification({
    userId: target, type: "race_invite", actorUserId: hostId, title: room.kind === "battle" ? "invited you to a trainer battle" : room.kind === "tag" ? "invited you to team up against a trainer" : room.kind === "duel" ? "invited you to a duel" : "invited you to a speedrun race",
    message: titleOf(room), link: `/races/${room.code}`, data: { code: room.code },
  }).catch((e) => console.warn("[versus] invite note:", e));
  return { ok: true };
}

/** The countdown: whoever is ready and whose timer GameShuffle can start races; everyone else is taken out. */
async function start(room: RoomRow): Promise<VersusResult> {
  if (room.status !== "open") return { ok: false, error: "closed" };
  const rows = await entrantsOf(room.id);
  const live = await roomRead(room.room_key);
  if (!live.ok || !live.room) return { ok: false, error: "relay", detail: live.ok ? "missing" : live.error };
  const n = checkpointsOf(room).length;
  // A duel has no timer to check: everyone ready plays.
  const keys = rows.filter((e) => e.status === "ready").filter((e) => {
    if (room.kind !== "speedrun") return true;
    const lane = live.room!.entrants.find((x) => x.key === e.user_id)?.lane;
    return speedrunReadiness(lane?.live ?? null, n).ok;
  }).map((e) => e.user_id);
  if (keys.length < VERSUS_MIN) return { ok: false, error: "need_two", detail: String(keys.length) };
  // A team race needs everyone racing on a team, and at least two teams with someone on them.
  const teams = cleanVersusSettings(room.settings).teams;
  if (teams) {
    const squads = rows.filter((e) => keys.includes(e.user_id)).map((e) => e.source?.squad ?? null);
    if (squads.some((q) => !q) || new Set(squads).size < 2) return { ok: false, error: "teams" };
  }
  const startAt = Date.now() + COUNTDOWN_S * 1000;
  const res = await roomStart(room.room_key, startAt, keys);
  if (!res.ok) return { ok: false, error: "relay", detail: res.error };
  const now = new Date().toISOString();
  await db().from("versus_rooms").update({ status: "countdown", starts_at: new Date(startAt).toISOString(), updated_at: now }).eq("id", room.id).eq("status", "open");
  await db().from("versus_entrants").update({ status: "racing", updated_at: now }).eq("room_id", room.id).in("user_id", keys);
  await db().from("versus_entrants").update({ status: "removed", updated_at: now }).eq("room_id", room.id).in("status", ["joined", "ready"]).not("user_id", "in", `(${keys.join(",")})`);
  await db().from("versus_entrants").delete().eq("room_id", room.id).eq("status", "invited");
  return { ok: true };
}

/** "Race again": a new room with the same settings from the host's setup; this one points at it, and an invite-only
 *  race invites the same runners. */
async function again(room: RoomRow, hostId: string): Promise<VersusResult<{ code?: string }>> {
  if (room.status !== "finished" && room.status !== "cancelled") return { ok: false, error: "closed" };
  if (room.next_code) return { ok: true, code: room.next_code };
  const s = cleanVersusSettings(room.settings);
  const made = await createRace(hostId, (room.kind === "duel" || room.kind === "tag") && s.duel ? { ...s, kind: room.kind, trainerId: s.duel.trainerId, level: s.duel.level }
    : room.kind === "battle" ? { ...s, kind: "battle", group: battleGroupOf(room) }
    : { ...s, seedMode: s.seed ? "pick" : undefined });
  if (!made.ok) return made;
  await db().from("versus_rooms").update({ next_code: made.code, updated_at: new Date().toISOString() }).eq("id", room.id);
  if (cleanVersusSettings(room.settings).join === "invite") {
    const next = await roomByCode(made.code);
    const racers = (await entrantsOf(room.id)).filter((e) => e.user_id !== hostId && ["racing", "done", "out"].includes(e.status));
    const { data } = await db().from("users").select("id, username").in("id", racers.map((e) => e.user_id));
    if (next) for (const u of (data ?? []) as { id: string; username: string | null }[]) if (u.username) await invite(next, hostId, u.username);
  }
  return { ok: true, code: made.code };
}

// ---- The relay's webhook --------------------------------------------------------------------------------------

export type RoomEventResult = { ok: true; did: string; room: RoomRow | null } | { ok: false; status: number; error: string };

/** What the relay's room says happened: the start, a lane ending, the finish (places), a cancel. */
export async function recordRoomEvent(body: RoomHookBody): Promise<RoomEventResult> {
  const room = await roomByKey(body.roomId);
  if (!room) return { ok: false, status: 404, error: "unknown_room" };
  const view = body.room;
  const now = new Date().toISOString();
  switch (body.event) {
    case "started": {
      await db().from("versus_rooms").update({ status: "running", started_at: view.startedAt ? new Date(view.startedAt).toISOString() : now, updated_at: now })
        .eq("id", room.id).in("status", ["open", "countdown"]);
      if (room.kind === "battle") await startBattleRoom(room);
      if (room.kind === "tag") await startTagRoom(room);
      return { ok: true, did: "started", room };
    }
    case "lane": {
      for (const e of view.entrants) {
        if (e.lane.status !== "done" && e.lane.status !== "out") continue;
        await db().from("versus_entrants").update({
          status: e.lane.status, final_ms: e.lane.status === "done" ? e.lane.finalMs : null, reached: e.lane.reached, out_reason: e.lane.outReason, updated_at: now,
        }).eq("room_id", room.id).eq("user_id", e.key).in("status", ["racing", "done", "out"]);
      }
      return { ok: true, did: "lane", room };
    }
    case "finished": {
      const results = finalResults(view);
      for (const r of results) {
        await db().from("versus_entrants").update({
          status: r.place != null ? "done" : "out", place: r.place, final_ms: r.finalMs, reached: r.reached, out_reason: r.outReason, updated_at: now,
        }).eq("room_id", room.id).eq("user_id", r.userId);
      }
      await db().from("versus_rooms").update({
        status: "finished", finished_at: view.finishedAt ? new Date(view.finishedAt).toISOString() : now, result: results, updated_at: now,
      }).eq("id", room.id).neq("status", "cancelled");
      return { ok: true, did: "finished", room: { ...room, status: "finished", result: results } };
    }
    case "cancelled": {
      await db().from("versus_rooms").update({ status: "cancelled", updated_at: now }).eq("id", room.id).neq("status", "finished");
      return { ok: true, did: "cancelled", room };
    }
    case "progress":
      return { ok: true, did: "progress", room };
    default:
      return { ok: false, status: 400, error: "bad_event" };
  }
}

export type { RoomView, VersusSettings };
