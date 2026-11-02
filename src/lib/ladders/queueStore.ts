import "server-only";

/**
 * The queue and rooms in the database (supabase/ranked-m2.sql; lounge system picks 2A to 7A and 13A, all as
 * recommended). Discord's buttons and the lounge's page call the same functions; the rules are in queue.ts.
 *
 *   - Always open: the moment a channel has `size` players, the first in make a room. Rush hour: players join until
 *     `closeMinutes` before a set Pacific time, then everyone is sorted by MMR into rooms and whoever's left waits.
 *   - A room votes its format for `voteSeconds` (closing early once everyone voted), then teams are drawn by MMR and the
 *     host is the highest MMR who can host. One format allowed (Knockout Tour) skips the vote.
 *   - Drop out (or the host marking a no-show) gives the lounge's drop penalty and asks the first sub in range, two
 *     minutes each, until one takes the spot.
 *   - Nothing runs on a timer of its own: the every-minute sweep (sweepQueues) closes votes, moves sub asks along and
 *     makes rush hour rooms, and every action does the same for its room as it goes.
 *
 * Room changes are version-guarded, so two presses at once land once.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { drawTeams, joinCheck, nextRush, nextSub, openRoom, pickHost, rushRooms, SUB_ASK_SECONDS, voteWinner, type JoinRefusal, type QueueChannel, type QueueEntry } from "./queue";
import { givePenalty, logAction, playerDiscipline, type Actor } from "./staffStore";
import type { LadderPlayer } from "./store";
import type { Ladder } from "./types";

const db = () => createServiceClient();

export interface Queue extends QueueChannel {
  ladderId: string;
  channelId: string | null;
  messageId: string | null;
  active: boolean;
  lastRushAt: string | null;
}

export interface QueuePlayer { playerId: string; discordId: string | null; name: string; mmr: number; placement: boolean; canHost: boolean }
export interface QueueRow extends QueuePlayer { kind: "play" | "sub"; joinedAt: string }

export interface SubAsk { outId: string; outName: string; team: number; askedId: string | null; askedDiscordId: string | null; askedName: string | null; askedMmr: number | null; askedAt: string | null; asked: string[] }

export type RoomStatus = "voting" | "playing" | "done" | "canceled";
export interface Room {
  id: string; ladderId: string; queueId: string | null; number: number; status: RoomStatus;
  players: QueuePlayer[]; votes: Record<string, number>; voteEndsAt: string | null; format: number | null; teams: QueuePlayer[][] | null;
  hostId: string | null; roomCode: string | null; subAsk: SubAsk | null; channelId: string | null; messageId: string | null; tableId: string | null;
  version: number; createdAt: string;
}

type QueueDb = {
  id: string; ladder_id: string; name: string; channel_id: string | null; message_id: string | null; mode: "open" | "rush"; size: 12 | 24; min_mmr: number | null; max_mmr: number | null;
  formats: number[]; vote_seconds: number; rush_times: string[]; close_minutes: number; lowest: boolean; active: boolean; last_rush_at: string | null;
};
const QUEUE_COLS = "id, ladder_id, name, channel_id, message_id, mode, size, min_mmr, max_mmr, formats, vote_seconds, rush_times, close_minutes, lowest, active, last_rush_at";
const toQueue = (r: QueueDb): Queue => ({
  id: r.id, ladderId: r.ladder_id, name: r.name, channelId: r.channel_id, messageId: r.message_id, mode: r.mode, size: r.size, minMmr: r.min_mmr, maxMmr: r.max_mmr,
  formats: r.formats?.length ? r.formats : [1], voteSeconds: r.vote_seconds, rushTimes: r.rush_times ?? [], closeMinutes: r.close_minutes, lowest: r.lowest, active: r.active, lastRushAt: r.last_rush_at,
});

type RoomDb = {
  id: string; ladder_id: string; queue_id: string | null; number: number; status: RoomStatus; players: QueuePlayer[]; votes: Record<string, number>; vote_ends_at: string | null;
  format: number | null; teams: QueuePlayer[][] | null; host_player_id: string | null; room_code: string | null; sub_ask: SubAsk | null; channel_id: string | null; message_id: string | null;
  table_id: string | null; version: number; created_at: string;
};
const ROOM_COLS = "id, ladder_id, queue_id, number, status, players, votes, vote_ends_at, format, teams, host_player_id, room_code, sub_ask, channel_id, message_id, table_id, version, created_at";
const toRoom = (r: RoomDb): Room => ({
  id: r.id, ladderId: r.ladder_id, queueId: r.queue_id, number: r.number, status: r.status, players: r.players ?? [], votes: r.votes ?? {}, voteEndsAt: r.vote_ends_at,
  format: r.format, teams: r.teams, hostId: r.host_player_id, roomCode: r.room_code, subAsk: r.sub_ask, channelId: r.channel_id, messageId: r.message_id, tableId: r.table_id,
  version: r.version, createdAt: r.created_at,
});

let ready: boolean | null = null;
/** Whether ranked-m2.sql has run (memoized once true). */
export async function queuesReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await db().from("ladder_rooms").select("id").limit(1);
  ready = !error;
  return ready;
}

// ── Queues ──────────────────────────────────────────────────────────────────────────────────

export async function listQueues(ladder: Pick<Ladder, "id">): Promise<Queue[]> {
  const { data } = await db().from("ladder_queues").select(QUEUE_COLS).eq("ladder_id", ladder.id).order("created_at");
  return ((data ?? []) as QueueDb[]).map(toQueue);
}

export async function getQueue(id: string): Promise<Queue | null> {
  const { data } = await db().from("ladder_queues").select(QUEUE_COLS).eq("id", id).maybeSingle();
  return data ? toQueue(data as QueueDb) : null;
}

export interface QueueInput { name: string; channelId: string | null; mode: "open" | "rush"; size: 12 | 24; minMmr: number | null; maxMmr: number | null; formats: number[]; voteSeconds: number; rushTimes: string[]; closeMinutes: number; lowest: boolean; active: boolean }

/** Stored settings read safely. */
export function cleanQueueInput(raw: Record<string, unknown>, ladder: Pick<Ladder, "kind">): QueueInput {
  const int = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const knockout = ladder.kind === "knockout";
  const formats = knockout ? [1] : [...new Set((Array.isArray(raw.formats) ? raw.formats : [1, 2, 3, 4, 6]).map(Number).filter((f) => [1, 2, 3, 4, 6].includes(f)))].sort((a, b) => a - b);
  return {
    name: String(raw.name ?? "Queue").trim().slice(0, 40) || "Queue",
    channelId: typeof raw.channelId === "string" && /^\d{5,25}$/.test(raw.channelId) ? raw.channelId : null,
    mode: raw.mode === "rush" ? "rush" : "open",
    size: knockout ? 24 : 12,
    minMmr: int(raw.minMmr), maxMmr: int(raw.maxMmr),
    formats: formats.length ? formats : [1],
    voteSeconds: Math.max(15, Math.min(300, int(raw.voteSeconds) ?? 45)),
    rushTimes: (Array.isArray(raw.rushTimes) ? raw.rushTimes : []).map(String).filter((t) => /^\d{2}:\d{2}$/.test(t)).slice(0, 12),
    closeMinutes: Math.max(0, Math.min(120, int(raw.closeMinutes) ?? 5)),
    lowest: raw.lowest === true,
    active: raw.active !== false,
  };
}

const queueRow = (q: QueueInput) => ({
  name: q.name, channel_id: q.channelId, mode: q.mode, size: q.size, min_mmr: q.minMmr, max_mmr: q.maxMmr, formats: q.formats, vote_seconds: q.voteSeconds,
  rush_times: q.rushTimes, close_minutes: q.closeMinutes, lowest: q.lowest, active: q.active,
});

export async function createQueue(ladder: Ladder, input: QueueInput, actor: Actor): Promise<Queue | null> {
  const { data, error } = await db().from("ladder_queues").insert({ ladder_id: ladder.id, ...queueRow(input) }).select(QUEUE_COLS).single();
  if (error) { console.error("[ranked] queue insert failed:", error.message); return null; }
  await logAction(ladder, actor, "queue_create", { detail: { name: input.name } });
  return toQueue(data as QueueDb);
}

export async function updateQueue(ladder: Ladder, id: string, input: QueueInput, actor: Actor): Promise<Queue | null> {
  const { data, error } = await db().from("ladder_queues").update(queueRow(input)).eq("id", id).eq("ladder_id", ladder.id).select(QUEUE_COLS).maybeSingle();
  if (error || !data) return null;
  await logAction(ladder, actor, "queue_edit", { detail: { name: input.name } });
  return toQueue(data as QueueDb);
}

export async function deleteQueue(ladder: Ladder, id: string, actor: Actor): Promise<boolean> {
  const { data } = await db().from("ladder_queues").delete().eq("id", id).eq("ladder_id", ladder.id).select("name");
  if (data?.length) await logAction(ladder, actor, "queue_delete", { detail: { name: (data[0] as { name: string }).name } });
  return !!data?.length;
}

export async function setQueueMessage(id: string, channelId: string, messageId: string | null): Promise<void> {
  await db().from("ladder_queues").update({ channel_id: channelId, message_id: messageId }).eq("id", id);
}

export async function queueEntries(queueId: string): Promise<QueueRow[]> {
  const { data } = await db().from("ladder_queue_entries").select("player_id, kind, discord_id, name, mmr, in_placement, joined_at, ladder_players(can_host)").eq("queue_id", queueId).order("joined_at");
  type R = { player_id: string; kind: "play" | "sub"; discord_id: string | null; name: string; mmr: number; in_placement: boolean; joined_at: string; ladder_players: { can_host: boolean } | null };
  return ((data ?? []) as unknown as R[]).map((r) => ({ playerId: r.player_id, kind: r.kind, discordId: r.discord_id, name: r.name, mmr: r.mmr, placement: r.in_placement, canHost: !!r.ladder_players?.can_host, joinedAt: r.joined_at }));
}

// ── Players ─────────────────────────────────────────────────────────────────────────────────

/** A player's numbers for the queue: this season's MMR (else the lounge's start), whether they're still placing, can host, on a break. */
export async function queuePlayer(ladder: Ladder, player: LadderPlayer): Promise<QueuePlayer & { onBreak: string | null }> {
  const [{ data: r }, { data: p }, discipline] = await Promise.all([
    db().from("ladder_ratings").select("mmr, events, carried").eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", player.id).maybeSingle(),
    db().from("ladder_players").select("can_host").eq("id", player.id).maybeSingle(),
    playerDiscipline(ladder, player.id),
  ]);
  const rating = r as { mmr: number; events: number; carried: boolean | null } | null;
  const placement = !rating || (!rating.carried && rating.events < Math.max(1, ladder.settings.placementEvents));
  return {
    playerId: player.id, discordId: player.discordId, name: player.name, mmr: rating?.mmr ?? ladder.settings.start, placement,
    canHost: !!(p as { can_host: boolean } | null)?.can_host, onBreak: discipline.breakUntil,
  };
}

export async function setCanHost(playerId: string, canHost: boolean): Promise<void> {
  await db().from("ladder_players").update({ can_host: canHost }).eq("id", playerId);
}

/** The room a player is in right now (voting or playing), if any. */
export async function activeRoomFor(ladderId: string, playerId: string): Promise<Room | null> {
  const { data } = await db().from("ladder_rooms").select(ROOM_COLS).eq("ladder_id", ladderId).in("status", ["voting", "playing"]).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as RoomDb[]).map(toRoom).find((r) => r.players.some((p) => p.playerId === playerId)) ?? null;
}

// ── Joining and leaving ─────────────────────────────────────────────────────────────────────

export type JoinResult =
  | { ok: true; queue: Queue; rooms: Room[] }
  | { ok: false; reason: JoinRefusal | "closed" | "in_room" | "inactive"; until?: string; room?: number };

/** Rush hour's window: joining closes `closeMinutes` before each time and opens again once it's passed. */
export function rushWindow(q: Queue, now: Date): { at: Date; closesAt: Date; closed: boolean } | null {
  const next = nextRush(q.rushTimes, q.closeMinutes, now);
  if (!next) return null;
  return { ...next, closed: now >= next.closesAt };
}

export async function joinQueue(ladder: Ladder, queue: Queue, player: LadderPlayer, kind: "play" | "sub" = "play"): Promise<JoinResult> {
  if (!queue.active) return { ok: false, reason: "inactive" };
  const me = await queuePlayer(ladder, player);
  if (me.onBreak) return { ok: false, reason: "on_break", until: me.onBreak };
  const inRoom = await activeRoomFor(ladder.id, player.id);
  if (inRoom && kind === "play") return { ok: false, reason: "in_room", room: inRoom.number };
  const entries = await queueEntries(queue.id);
  const mine = entries.some((e) => e.playerId === player.id && e.kind === kind);
  if (kind === "play") {
    if (queue.mode === "rush") { const w = rushWindow(queue, new Date()); if (w?.closed) return { ok: false, reason: "closed", until: w.at.toISOString() }; }
    const refusal = joinCheck(queue, { mmr: me.mmr, placing: me.placement }, mine);
    if (refusal) return { ok: false, reason: refusal };
  } else if (mine) return { ok: false, reason: "already_in" };
  const { error } = await db().from("ladder_queue_entries").insert({ queue_id: queue.id, player_id: player.id, kind, discord_id: player.discordId, name: player.name, mmr: me.mmr, in_placement: me.placement });
  if (error) return { ok: false, reason: "already_in" };
  const rooms = kind === "play" && queue.mode === "open" ? await fillOpen(ladder, queue) : [];
  return { ok: true, queue, rooms };
}

export async function leaveQueue(queue: Queue, playerId: string, kind: "play" | "sub" = "play"): Promise<boolean> {
  const { data } = await db().from("ladder_queue_entries").delete().eq("queue_id", queue.id).eq("player_id", playerId).eq("kind", kind).select("player_id");
  return !!data?.length;
}

const asEntry = (e: QueueRow): QueueEntry & QueueRow => ({ ...e, key: e.playerId, placing: e.placement });

/** Always open: makes a room from the first `size` in, as many times as there are full rooms. */
async function fillOpen(ladder: Ladder, queue: Queue): Promise<Room[]> {
  const made: Room[] = [];
  for (let i = 0; i < 4; i++) {
    const play = (await queueEntries(queue.id)).filter((e) => e.kind === "play").map(asEntry);
    const picked = openRoom(play, queue.size);
    if (!picked) break;
    const room = await makeRoom(ladder, queue, picked.room);
    if (!room) break;
    made.push(room);
  }
  return made;
}

/**
 * Claims the players (their queue entries go first, so a room is only made once) and makes the room. A player in the
 * room leaves every queue of the lounge.
 */
async function makeRoom(ladder: Ladder, queue: Queue, players: (QueueEntry & QueueRow)[]): Promise<Room | null> {
  const ids = players.map((p) => p.playerId);
  const { data: claimed } = await db().from("ladder_queue_entries").delete().eq("queue_id", queue.id).eq("kind", "play").in("player_id", ids).select("player_id");
  if ((claimed ?? []).length !== ids.length) {
    // Someone left or was taken by another room in the meantime: put back whoever was claimed here.
    const back = players.filter((p) => ((claimed ?? []) as { player_id: string }[]).some((c) => c.player_id === p.playerId));
    if (back.length) await db().from("ladder_queue_entries").insert(back.map((p) => ({ queue_id: queue.id, player_id: p.playerId, kind: "play", discord_id: p.discordId, name: p.name, mmr: p.mmr, in_placement: p.placement, joined_at: p.joinedAt })));
    return null;
  }
  const others = (await listQueues(ladder)).filter((q) => q.id !== queue.id).map((q) => q.id);
  if (others.length) await db().from("ladder_queue_entries").delete().in("queue_id", others).eq("kind", "play").in("player_id", ids);
  const roomPlayers: QueuePlayer[] = players.map((p) => ({ playerId: p.playerId, discordId: p.discordId, name: p.name, mmr: p.mmr, placement: p.placement, canHost: p.canHost }));
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: last } = await db().from("ladder_rooms").select("number").eq("ladder_id", ladder.id).order("number", { ascending: false }).limit(1);
    const number = (((last ?? [])[0] as { number: number } | undefined)?.number ?? 0) + 1;
    const oneFormat = queue.formats.length === 1;
    const { data, error } = await db().from("ladder_rooms").insert({
      ladder_id: ladder.id, queue_id: queue.id, number, players: roomPlayers, channel_id: queue.channelId,
      status: "voting", vote_ends_at: new Date(Date.now() + (oneFormat ? 0 : queue.voteSeconds * 1000)).toISOString(),
    }).select(ROOM_COLS).single();
    if (error?.code === "23505") continue;
    if (error || !data) { console.error("[ranked] room insert failed:", error?.message); return null; }
    let room = toRoom(data as RoomDb);
    if (oneFormat) room = (await closeVote(ladder, room, queue)) ?? room;
    return room;
  }
  return null;
}

// ── Rooms ───────────────────────────────────────────────────────────────────────────────────

export async function getRoom(id: string): Promise<Room | null> {
  const { data } = await db().from("ladder_rooms").select(ROOM_COLS).eq("id", id).maybeSingle();
  return data ? toRoom(data as RoomDb) : null;
}

export async function openRooms(ladderId: string): Promise<Room[]> {
  const { data } = await db().from("ladder_rooms").select(ROOM_COLS).eq("ladder_id", ladderId).in("status", ["voting", "playing"]).order("number", { ascending: false }).limit(30);
  return ((data ?? []) as RoomDb[]).map(toRoom);
}

/** A version-guarded room update: lands only if nobody changed the room since `room` was read. */
async function writeRoom(room: Room, patch: Record<string, unknown>): Promise<Room | null> {
  const { data } = await db().from("ladder_rooms").update({ ...patch, version: room.version + 1 }).eq("id", room.id).eq("version", room.version).select(ROOM_COLS).maybeSingle();
  return data ? toRoom(data as RoomDb) : null;
}

export async function setRoomMessage(room: Room, channelId: string, messageId: string): Promise<void> {
  await db().from("ladder_rooms").update({ channel_id: channelId, message_id: messageId }).eq("id", room.id);
}

export type VoteResult = { ok: true; room: Room; closed: boolean } | { ok: false; reason: "not_in_room" | "not_voting" | "bad_format" | "busy" };

export async function voteFormat(ladder: Ladder, roomId: string, playerId: string, format: number): Promise<VoteResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const room = await getRoom(roomId);
    if (!room || room.status !== "voting") return { ok: false, reason: "not_voting" };
    if (!room.players.some((p) => p.playerId === playerId)) return { ok: false, reason: "not_in_room" };
    const queue = room.queueId ? await getQueue(room.queueId) : null;
    if (!(queue?.formats ?? [1, 2, 3, 4, 6]).includes(format)) return { ok: false, reason: "bad_format" };
    const written = await writeRoom(room, { votes: { ...room.votes, [playerId]: format } });
    if (!written) continue;
    if (Object.keys(written.votes).length >= written.players.length) {
      const closed = await closeVote(ladder, written, queue);
      return { ok: true, room: closed ?? written, closed: !!closed };
    }
    return { ok: true, room: written, closed: false };
  }
  return { ok: false, reason: "busy" };
}

/** Ends the vote: the format, teams drawn by MMR, the host. */
export async function closeVote(ladder: Ladder, room: Room, queue: Queue | null): Promise<Room | null> {
  if (room.status !== "voting") return null;
  const allowed = queue?.formats?.length ? queue.formats : [1];
  const format = voteWinner(Object.values(room.votes), allowed);
  const players = room.players.map((p) => ({ ...p, key: p.playerId }));
  const teams = drawTeams(players, format).map((t) => t.map(({ key: _k, ...p }) => { void _k; return p; }));
  const host = pickHost(players);
  return writeRoom(room, { status: "playing", format, teams, host_player_id: host?.playerId ?? null, vote_ends_at: null });
}

export async function setRoomCode(roomId: string, playerId: string, code: string): Promise<{ ok: true; room: Room } | { ok: false; reason: "not_host" | "not_playing" | "busy" }> {
  const room = await getRoom(roomId);
  if (!room || room.status !== "playing") return { ok: false, reason: "not_playing" };
  if (room.hostId !== playerId) return { ok: false, reason: "not_host" };
  const written = await writeRoom(room, { room_code: code.trim().slice(0, 40) || null });
  return written ? { ok: true, room: written } : { ok: false, reason: "busy" };
}

/** The next sub in range for a room's open spot, or none (`asked` grows as subs pass or time out). */
async function askNextSub(room: Room, ask: SubAsk): Promise<SubAsk> {
  const queue = room.queueId ? await getQueue(room.queueId) : null;
  const subs = queue ? (await queueEntries(queue.id)).filter((e) => e.kind === "sub" && !room.players.some((p) => p.playerId === e.playerId)) : [];
  const next = queue ? nextSub(subs.map((s) => ({ ...s, key: s.playerId })), queue, new Set(ask.asked)) : null;
  return next
    ? { ...ask, askedId: next.playerId, askedDiscordId: next.discordId, askedName: next.name, askedMmr: next.mmr, askedAt: new Date().toISOString(), asked: [...ask.asked, next.playerId] }
    : { ...ask, askedId: null, askedDiscordId: null, askedName: null, askedMmr: null, askedAt: null };
}

export type DropResult = { ok: true; room: Room; penalty: { before: number; after: number; strikes: number; breakUntil: string | null } | null } | { ok: false; reason: "not_in_room" | "not_playing" | "not_host" | "busy" | "asking" };

/**
 * A player drops out (`by` is them) or the host marks a no-show (`by` is the host): the lounge's drop penalty
 * (dropped before race 1) and the first sub in range is asked.
 */
export async function dropFromRoom(ladder: Ladder, roomId: string, outId: string, byId: string, actor: Actor): Promise<DropResult> {
  const room = await getRoom(roomId);
  if (!room || room.status !== "playing") return { ok: false, reason: "not_playing" };
  const out = room.players.find((p) => p.playerId === outId);
  if (!out) return { ok: false, reason: "not_in_room" };
  if (byId !== outId && room.hostId !== byId) return { ok: false, reason: "not_host" };
  if (room.subAsk) return { ok: false, reason: "asking" };
  const team = (room.teams ?? []).findIndex((t) => t.some((p) => p.playerId === outId));
  const ask = await askNextSub(room, { outId, outName: out.name, team: Math.max(0, team), askedId: null, askedDiscordId: null, askedName: null, askedMmr: null, askedAt: null, asked: [] });
  const written = await writeRoom(room, { sub_ask: ask });
  if (!written) return { ok: false, reason: "busy" };
  const res = await givePenalty(ladder, { playerId: outId, kind: "drop_before", reason: `${byId === outId ? "Dropped out of" : "Didn't show for"} room ${room.number}` }, actor);
  return { ok: true, room: written, penalty: res.ok ? { before: res.before, after: res.after, strikes: res.strikes, breakUntil: res.breakUntil } : null };
}

export type SubResult = { ok: true; room: Room } | { ok: false; reason: "not_asked" | "expired" | "busy" | "in_room" };

/** The asked sub takes the spot: they replace the player who dropped, on the same team. */
export async function takeSpot(ladder: Ladder, roomId: string, playerId: string): Promise<SubResult> {
  const room = await getRoom(roomId);
  const ask = room?.subAsk;
  if (!room || !ask || ask.askedId !== playerId) return { ok: false, reason: "not_asked" };
  if (ask.askedAt && Date.now() - Date.parse(ask.askedAt) > SUB_ASK_SECONDS * 1000 + 5000) return { ok: false, reason: "expired" };
  if (await activeRoomFor(ladder.id, playerId)) return { ok: false, reason: "in_room" };
  const sub: QueuePlayer = { playerId, discordId: ask.askedDiscordId, name: ask.askedName ?? "Sub", mmr: ask.askedMmr ?? ladder.settings.start, placement: false, canHost: false };
  const swap = (p: QueuePlayer) => (p.playerId === ask.outId ? sub : p);
  const written = await writeRoom(room, {
    players: room.players.map(swap), teams: room.teams?.map((t) => t.map(swap)) ?? null, sub_ask: null,
    host_player_id: room.hostId === ask.outId ? pickHost(room.players.filter((p) => p.playerId !== ask.outId).map((p) => ({ ...p, key: p.playerId })))?.playerId ?? null : room.hostId,
  });
  if (!written) return { ok: false, reason: "busy" };
  if (room.queueId) await db().from("ladder_queue_entries").delete().eq("player_id", playerId).eq("kind", "sub").eq("queue_id", room.queueId);
  return { ok: true, room: written };
}

/** The asked sub passes (or their two minutes run out): the next sub in range is asked. */
export async function passSpot(roomId: string, playerId: string | null): Promise<SubResult> {
  const room = await getRoom(roomId);
  const ask = room?.subAsk;
  if (!room || !ask) return { ok: false, reason: "not_asked" };
  if (playerId && ask.askedId !== playerId) return { ok: false, reason: "not_asked" };
  const next = await askNextSub(room, ask);
  const written = await writeRoom(room, { sub_ask: next });
  return written ? { ok: true, room: written } : { ok: false, reason: "busy" };
}

/** Staff or the host give up on a sub: the room plays short. */
export async function playShort(roomId: string): Promise<Room | null> {
  const room = await getRoom(roomId);
  if (!room?.subAsk) return null;
  const ask = room.subAsk;
  return writeRoom(room, {
    players: room.players.filter((p) => p.playerId !== ask.outId), teams: room.teams?.map((t) => t.filter((p) => p.playerId !== ask.outId)) ?? null, sub_ask: null,
  });
}

/** The table from a room went in: the room is done. */
export async function finishRoom(roomId: string, tableId: string): Promise<Room | null> {
  const room = await getRoom(roomId);
  if (!room || room.status !== "playing") return null;
  return writeRoom(room, { status: "done", table_id: tableId, sub_ask: null });
}

export async function cancelRoom(ladder: Ladder, roomId: string, actor: Actor): Promise<Room | null> {
  const room = await getRoom(roomId);
  if (!room || (room.status !== "voting" && room.status !== "playing")) return null;
  const written = await writeRoom(room, { status: "canceled", sub_ask: null });
  if (written) await logAction(ladder, actor, "room_cancel", { detail: { number: room.number } });
  return written;
}

/** The room's table text for the submit form: team headings and every name, scores to fill in. */
export function roomTableText(room: Room, kind: Ladder["kind"]): string {
  if (kind === "knockout") return room.players.map((p) => p.name).join("\n");
  if (!room.teams || (room.format ?? 1) === 1) return room.players.map((p) => `${p.name} `).join("\n");
  return room.teams.map((t, i) => [`# Team ${String.fromCharCode(65 + i)}`, ...t.map((p) => `${p.name} `)].join("\n")).join("\n");
}

// ── The sweep ───────────────────────────────────────────────────────────────────────────────

export interface SweepChange { kind: "vote_closed" | "sub_moved" | "rush_rooms"; ladderId: string; room?: Room; rooms?: Room[]; queue?: Queue }

/** Every minute: votes whose time is up close, sub asks past two minutes move on, rush hours due make their rooms. */
export async function sweepQueues(now = new Date()): Promise<SweepChange[]> {
  if (!(await queuesReady())) return [];
  const changes: SweepChange[] = [];
  const { getLadder } = await import("./store");
  const ladders = new Map<string, Ladder | null>();
  const ladderOf = async (id: string) => { if (!ladders.has(id)) ladders.set(id, await getLadder({ id })); return ladders.get(id) ?? null; };

  const { data: due } = await db().from("ladder_rooms").select(ROOM_COLS).eq("status", "voting").lte("vote_ends_at", now.toISOString()).limit(25);
  for (const r of (due ?? []) as RoomDb[]) {
    const room = toRoom(r);
    const ladder = await ladderOf(room.ladderId);
    if (!ladder) continue;
    const closed = await closeVote(ladder, room, room.queueId ? await getQueue(room.queueId) : null);
    if (closed) changes.push({ kind: "vote_closed", ladderId: ladder.id, room: closed });
  }

  const { data: asking } = await db().from("ladder_rooms").select(ROOM_COLS).eq("status", "playing").not("sub_ask", "is", null).limit(50);
  for (const r of (asking ?? []) as RoomDb[]) {
    const room = toRoom(r);
    const at = room.subAsk?.askedAt;
    if (!at || now.getTime() - Date.parse(at) < SUB_ASK_SECONDS * 1000) continue;
    const moved = await passSpot(room.id, null);
    if (moved.ok) changes.push({ kind: "sub_moved", ladderId: room.ladderId, room: moved.room });
  }

  const { data: rush } = await db().from("ladder_queues").select(QUEUE_COLS).eq("mode", "rush").eq("active", true).limit(50);
  for (const r of (rush ?? []) as QueueDb[]) {
    const queue = toQueue(r);
    const since = queue.lastRushAt ? new Date(queue.lastRushAt) : new Date(now.getTime() - 15 * 60_000);
    const next = nextRush(queue.rushTimes, queue.closeMinutes, since);
    if (!next || next.at > now) continue;
    // Claim this rush hour first, so two sweeps can't both make its rooms.
    const claim = db().from("ladder_queues").update({ last_rush_at: next.at.toISOString() }).eq("id", queue.id);
    const { data: claimed } = await (queue.lastRushAt ? claim.eq("last_rush_at", queue.lastRushAt) : claim.is("last_rush_at", null)).select("id");
    if (!claimed?.length) continue;
    const ladder = await ladderOf(queue.ladderId);
    if (!ladder) continue;
    const play = (await queueEntries(queue.id)).filter((e) => e.kind === "play").map(asEntry);
    const { rooms } = rushRooms(play, queue.size);
    const made: Room[] = [];
    for (const group of rooms) { const room = await makeRoom(ladder, queue, group); if (room) made.push(room); }
    changes.push({ kind: "rush_rooms", ladderId: ladder.id, rooms: made, queue });
  }
  return changes;
}
