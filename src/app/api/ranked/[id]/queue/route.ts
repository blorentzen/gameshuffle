/**
 * GET/POST /api/ranked/[id]/queue: a lounge's queues and rooms on the web (name, web and docs pick 7A; lounge system
 * picks 2A to 7A). The same engine as the Discord cards (queueStore.ts), and every change shows on those cards too.
 *
 *   GET                  queues (who's in, rush hour times), open rooms (votes, teams, host, code, sub asks), and you
 *   POST { action }      join | leave | sub | host | vote | code | drop | noshow | take | pass | short
 */

import { after, NextResponse } from "next/server";
import { rankedAccess } from "@/lib/ladders/access";
import { rangeLine, postQueueCard, postRoomCard, postSubAsk } from "@/lib/ladders/queueCards";
import {
  dropFromRoom, getQueue, getRoom, joinQueue, leaveQueue, listQueues, openRooms, passSpot, playShort, queueEntries, queuesReady, rushWindow, setCanHost, setRoomCode,
  takeSpot, voteFormat, type Queue, type Room,
} from "@/lib/ladders/queueStore";
import { getLadder, laddersReady, playerForDiscord } from "@/lib/ladders/store";
import type { Ladder } from "@/lib/ladders/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

async function lounge(ctx: Ctx): Promise<Ladder | NextResponse> {
  if (!(await laddersReady()) || !(await queuesReady())) return fail("not_ready", 503);
  const ladder = await getLadder({ id: (await ctx.params).id });
  return ladder ?? fail("not_found", 404);
}

function roomView(room: Room, me: string | null, formats: number[]) {
  return {
    formats, id: room.id, number: room.number, status: room.status, format: room.format, voteEndsAt: room.voteEndsAt, roomCode: room.roomCode,
    players: room.players.map((p) => ({ id: p.playerId, name: p.name, mmr: p.mmr })),
    votes: Object.values(room.votes).reduce<Record<string, number>>((a, f) => { a[f] = (a[f] ?? 0) + 1; return a; }, {}),
    myVote: me ? room.votes[me] ?? null : null,
    teams: room.teams?.map((t) => t.map((p) => ({ id: p.playerId, name: p.name, mmr: p.mmr }))) ?? null,
    host: room.players.find((p) => p.playerId === room.hostId)?.name ?? null,
    subAsk: room.subAsk ? { out: room.subAsk.outName, asked: room.subAsk.askedName, askedAt: room.subAsk.askedAt, mine: !!me && room.subAsk.askedId === me } : null,
    mine: !!me && room.players.some((p) => p.playerId === me), isHost: !!me && room.hostId === me,
  };
}

export async function GET(_request: Request, ctx: Ctx) {
  const ladder = await lounge(ctx);
  if (ladder instanceof NextResponse) return ladder;
  const access = await rankedAccess(ladder);
  const player = access.discordId ? await playerForDiscord(ladder.id, access.discordId) : null;
  const me = player?.id ?? null;
  const queues = (await listQueues(ladder)).filter((q) => q.active);
  const now = new Date();
  const views = await Promise.all(queues.map(async (q) => {
    const entries = await queueEntries(q.id);
    const play = entries.filter((e) => e.kind === "play");
    const w = q.mode === "rush" ? rushWindow(q, now) : null;
    return {
      id: q.id, name: q.name, mode: q.mode, size: q.size, range: rangeLine(q), formats: q.formats,
      players: play.map((e) => ({ name: e.name, canHost: e.canHost })), subs: entries.filter((e) => e.kind === "sub").length,
      rush: w ? { at: w.at.toISOString(), closesAt: w.closesAt.toISOString(), closed: w.closed } : null,
      mine: { play: !!me && play.some((e) => e.playerId === me), sub: !!me && entries.some((e) => e.kind === "sub" && e.playerId === me) },
    };
  }));
  const all = await listQueues(ladder);
  const rooms = (await openRooms(ladder.id)).map((r) => roomView(r, me, all.find((q) => q.id === r.queueId)?.formats ?? [1, 2, 3, 4, 6]));
  const { data } = me ? await (await import("@/lib/supabase/admin")).createServiceClient().from("ladder_players").select("can_host").eq("id", me).maybeSingle() : { data: null };
  return NextResponse.json({
    queues: views, rooms,
    you: { signedIn: !!access.userId, discord: !!access.discordId, player: player ? { id: player.id, name: player.name, canHost: !!(data as { can_host: boolean } | null)?.can_host } : null },
  });
}

const REFUSALS: Record<string, string> = {
  on_break: "on_break", in_room: "in_room", already_in: "already_in", closed: "closed", below_tier: "below_tier", above_tier: "above_tier",
  placement_lowest: "placement_lowest", inactive: "inactive",
};

export async function POST(request: Request, ctx: Ctx) {
  const ladder = await lounge(ctx);
  if (ladder instanceof NextResponse) return ladder;
  const access = await rankedAccess(ladder);
  if (!access.userId) return fail("signin", 401);
  if (!access.discordId) return fail("no_discord", 403);
  // The same people as the Discord card: members of the lounge's server.
  if (access.role === "outside") return fail("not_member", 403);
  const player = await playerForDiscord(ladder.id, access.discordId);
  if (!player) return fail("not_player", 403);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const actor = { id: access.discordId, name: access.name, via: "web" as const };
  const queueOf = async (): Promise<Queue | null> => { const q = typeof body.queueId === "string" ? await getQueue(body.queueId) : null; return q && q.ladderId === ladder.id ? q : null; };
  const roomOf = async (): Promise<Room | null> => { const r = typeof body.roomId === "string" ? await getRoom(body.roomId) : null; return r && r.ladderId === ladder.id ? r : null; };
  const cards = (fn: () => Promise<unknown>) => after(async () => { await fn().catch((err) => console.error("[ranked] card refresh failed:", err)); });
  const refreshQueue = (q: Queue) => cards(async () => postQueueCard(ladder, (await getQueue(q.id)) ?? q, await queueEntries(q.id)));
  const refreshRoom = (r: Room, ask = false) => cards(async () => { const q = r.queueId ? await getQueue(r.queueId) : null; await postRoomCard(ladder, r, q); if (ask) await postSubAsk(r, q); });

  switch (body.action) {
    case "join": case "sub": {
      const q = await queueOf();
      if (!q) return fail("not_found", 404);
      const res = await joinQueue(ladder, q, player, body.action === "sub" ? "sub" : "play");
      if (!res.ok) return fail(REFUSALS[res.reason] ?? "refused", 409, { until: res.until ?? null, room: res.room ?? null, min: q.minMmr, max: q.maxMmr });
      refreshQueue(q);
      for (const room of res.rooms) refreshRoom(room);
      return NextResponse.json({ ok: true, rooms: res.rooms.map((r) => r.number) });
    }
    case "leave": {
      const q = await queueOf();
      if (!q) return fail("not_found", 404);
      const left = await leaveQueue(q, player.id, body.kind === "sub" ? "sub" : "play");
      if (!left) return fail("not_in", 409);
      refreshQueue(q);
      return NextResponse.json({ ok: true });
    }
    case "host": {
      await setCanHost(player.id, body.canHost === true);
      for (const q of await listQueues(ladder)) if ((await queueEntries(q.id)).some((e) => e.playerId === player.id)) refreshQueue(q);
      return NextResponse.json({ ok: true });
    }
    case "vote": {
      const r = await roomOf();
      if (!r) return fail("not_found", 404);
      const res = await voteFormat(ladder, r.id, player.id, Number(body.format));
      if (!res.ok) return fail(res.reason, 409);
      refreshRoom(res.room);
      return NextResponse.json({ ok: true });
    }
    case "code": {
      const r = await roomOf();
      if (!r) return fail("not_found", 404);
      const res = await setRoomCode(r.id, player.id, String(body.code ?? ""));
      if (!res.ok) return fail(res.reason, 409);
      refreshRoom(res.room);
      return NextResponse.json({ ok: true });
    }
    case "drop": case "noshow": {
      const r = await roomOf();
      if (!r) return fail("not_found", 404);
      const out = body.action === "drop" ? player.id : String(body.playerId ?? "");
      const res = await dropFromRoom(ladder, r.id, out, player.id, actor);
      if (!res.ok) return fail(res.reason, 409);
      refreshRoom(res.room, true);
      return NextResponse.json({ ok: true, asked: res.room.subAsk?.askedName ?? null });
    }
    case "take": {
      const r = await roomOf();
      if (!r) return fail("not_found", 404);
      const res = await takeSpot(ladder, r.id, player.id);
      if (!res.ok) return fail(res.reason, 409);
      refreshRoom(res.room);
      return NextResponse.json({ ok: true });
    }
    case "pass": {
      const r = await roomOf();
      if (!r) return fail("not_found", 404);
      const res = await passSpot(r.id, player.id);
      if (!res.ok) return fail(res.reason, 409);
      refreshRoom(res.room, true);
      return NextResponse.json({ ok: true });
    }
    case "short": {
      const r = await roomOf();
      if (!r || (r.hostId !== player.id && !access.staff)) return fail("not_host", 403);
      const done = await playShort(r.id);
      if (!done) return fail("no_spot", 409);
      refreshRoom(done);
      return NextResponse.json({ ok: true });
    }
  }
  return fail("bad_request");
}
