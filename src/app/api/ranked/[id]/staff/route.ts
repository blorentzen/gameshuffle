/**
 * GET/POST /api/ranked/[id]/staff: a lounge's staff page (name, web and docs picks 2026-11-01, picks 3A to 6A).
 * Staff are the lounge's own Discord roles (access.ts): admins (the server's owner and managers) and updaters, plus
 * GameShuffle staff. Every action is the same one the Discord buttons run, logged, and shown on the Discord card.
 *
 *   GET                 the hub: tables waiting with why, requests, strikes and breaks, seasons, settings, the log
 *   GET ?table=<id>     one table's review: the screenshot, typed vs read, missed races
 *   GET ?players=<q>    player search
 *   GET ?channels=1     the server's text channels (for a queue's channel)
 *   POST { action }     verify | send_back | undo | penalty | undo_penalty | end_break | decide | rename | room_cancel
 *                       | settings, end_season, queue_save, queue_delete, queue_post (admins)
 */

import { NextResponse } from "next/server";
import { rankedAccess, type RankedAccess } from "@/lib/ladders/access";
import { staffSendBack, staffUndo, staffVerify } from "@/lib/ladders/actions";
import { reviewRows } from "@/lib/ladders/review";
import { parseRoom } from "@/lib/ladders/rules";
import {
  decideRequest, disciplineBoard, endBreak, endSeason, givePenalty, listRequests, renamePlayer, saveStaffSettings, searchPlayers, staffLog,
  tablesNeedingSomeone, undoPenalty, type Actor,
} from "@/lib/ladders/staffStore";
import { getLadder, getTable, ladderSeasons, laddersReady, tableRoom, type LadderTable } from "@/lib/ladders/store";
import type { PenaltyKind } from "@/lib/ladders/discipline";
import { cancelRoom, cleanQueueInput, createQueue, deleteQueue, getQueue, listQueues, openRooms, queueEntries, queuesReady, updateQueue } from "@/lib/ladders/queueStore";
import { postQueueCard, postRoomCard, rangeLine } from "@/lib/ladders/queueCards";
import { compRest } from "@/lib/discord/compRest";
import type { Ladder } from "@/lib/ladders/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function gate(ctx: Ctx): Promise<{ ladder: Ladder; access: RankedAccess } | NextResponse> {
  if (!(await laddersReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const ladder = await getLadder({ id: (await ctx.params).id });
  if (!ladder) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await rankedAccess(ladder);
  if (!access.userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!access.staff) return NextResponse.json({ error: "not_staff", why: access.why }, { status: 403 });
  return { ladder, access };
}

const actorOf = (a: RankedAccess): Actor => ({ id: a.discordId ?? `gs:${a.userId}`, name: a.name, via: "web" });

/** A waiting table as the staff page lists it. */
function tableRow(t: LadderTable) {
  return {
    id: t.id, number: t.number, format: t.format, tier: t.tier, status: t.status, submittedByName: t.submittedByName, createdAt: t.createdAt,
    reasons: t.checkReasons, autoAt: t.autoAt, shotUrl: t.shotUrl, missed: t.missed.length,
  };
}

export async function GET(request: Request, ctx: Ctx) {
  const g = await gate(ctx);
  if (g instanceof NextResponse) return g;
  const { ladder, access } = g;
  const url = new URL(request.url);

  const tableId = url.searchParams.get("table");
  if (tableId) {
    const t = await getTable(tableId);
    if (!t || t.ladderId !== ladder.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const typed = tableRoom(ladder, t);
    const read = t.readBody ? parseRoom(ladder.kind, t.readBody, t.format) : null;
    const names = new Map(typed.teams.flatMap((x) => x.players.map((p) => [p.key, p.name] as const)));
    return NextResponse.json({
      table: { ...tableRow(t), body: t.body, autoVerified: t.autoVerified, verifiedByName: t.verifiedByName, note: t.note },
      review: reviewRows(typed, read),
      missed: t.missed.map((m) => ({ name: names.get(m.key) ?? m.key, races: m.races })),
    });
  }

  const q = url.searchParams.get("players");
  if (q != null) return NextResponse.json({ players: await searchPlayers(ladder, q) });

  if (url.searchParams.get("channels")) {
    const res = await compRest<{ id: string; name: string; type: number; position: number }[]>("GET", `/guilds/${ladder.guildId}/channels`);
    const channels = res.ok ? res.data.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name })) : [];
    return NextResponse.json({ channels, ok: res.ok });
  }

  const queued = await queuesReady();
  const [tables, requests, discipline, seasons, log, queues, rooms] = await Promise.all([
    tablesNeedingSomeone(ladder), listRequests(ladder, "open"), disciplineBoard(ladder), ladderSeasons(ladder), staffLog(ladder, 150),
    queued ? listQueues(ladder) : Promise.resolve([]), queued ? openRooms(ladder.id) : Promise.resolve([]),
  ]);
  return NextResponse.json({
    you: { name: access.name, role: access.role, gsStaff: access.gsStaff },
    ladder: { id: ladder.id, slug: ladder.slug, name: ladder.name, kind: ladder.kind, season: ladder.season, rules: ladder.settings.rules, settings: { staff: ladder.settings.staff, discipline: ladder.settings.discipline, rolesOn: ladder.settings.roles.on } },
    tables: { waiting: tables.waiting.map(tableRow), autoToday: tables.autoToday },
    requests,
    discipline,
    seasons,
    log,
    queues: queued ? await Promise.all(queues.map(async (x) => ({ ...x, range: rangeLine(x), waiting: (await queueEntries(x.id)).filter((e) => e.kind === "play").length }))) : null,
    rooms: rooms.map((r) => ({ id: r.id, number: r.number, status: r.status, format: r.format, players: r.players.length, host: r.players.find((p) => p.playerId === r.hostId)?.name ?? null, createdAt: r.createdAt })),
  });
}

const PENALTY_KINDS: PenaltyKind[] = ["late", "drop_before", "drop_during", "tag", "other"];
const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request, ctx: Ctx) {
  const g = await gate(ctx);
  if (g instanceof NextResponse) return g;
  const { ladder, access } = g;
  const actor = actorOf(access);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const tableFor = async () => {
    const t = typeof body.tableId === "string" ? await getTable(body.tableId) : null;
    return t && t.ladderId === ladder.id ? t : null;
  };

  switch (body.action) {
    case "verify": {
      const t = await tableFor();
      if (!t) return fail("not_found", 404);
      const res = await staffVerify(ladder, t, actor, { useRead: body.useRead === true });
      return res.ok ? NextResponse.json({ ok: true }) : fail(res.error, 409);
    }
    case "send_back": {
      const t = await tableFor();
      if (!t) return fail("not_found", 404);
      return (await staffSendBack(ladder, t, actor, str(body.note))) ? NextResponse.json({ ok: true }) : fail("not_pending", 409);
    }
    case "undo": {
      const t = await tableFor();
      if (!t) return fail("not_found", 404);
      return (await staffUndo(ladder, t, actor)) ? NextResponse.json({ ok: true }) : fail("not_verified", 409);
    }
    case "penalty": {
      const kind = PENALTY_KINDS.includes(body.kind as PenaltyKind) ? (body.kind as PenaltyKind) : null;
      if (typeof body.playerId !== "string" || !kind) return fail("bad_request");
      const res = await givePenalty(ladder, {
        playerId: body.playerId, kind,
        mmr: body.mmr == null ? undefined : Number(body.mmr), strikes: body.strikes == null ? undefined : Number(body.strikes),
        reason: str(body.reason), tableId: typeof body.tableId === "string" ? body.tableId : null,
      }, actor);
      return res.ok ? NextResponse.json(res) : fail(res.error, res.error === "no_rating" ? 409 : 500);
    }
    case "undo_penalty": {
      if (typeof body.logId !== "string") return fail("bad_request");
      const res = await undoPenalty(ladder, body.logId, actor);
      return res === "ok" ? NextResponse.json({ ok: true }) : fail(res, 409);
    }
    case "end_break": {
      if (typeof body.playerId !== "string") return fail("bad_request");
      return (await endBreak(ladder, body.playerId, actor)) ? NextResponse.json({ ok: true }) : fail("no_break", 409);
    }
    case "decide": {
      if (typeof body.requestId !== "string") return fail("bad_request");
      const res = await decideRequest(ladder, body.requestId, body.accept === true, actor, str(body.note));
      return res === "ok" ? NextResponse.json({ ok: true }) : fail(res, res === "failed" ? 500 : 409);
    }
    case "rename": {
      const name = str(body.name, 32);
      if (typeof body.playerId !== "string" || !name) return fail("bad_request");
      const res = await renamePlayer(ladder, body.playerId, name, actor);
      return res === "ok" ? NextResponse.json({ ok: true }) : fail(res, 409);
    }
    case "settings": {
      if (access.role !== "admin") return fail("admins_only", 403);
      const staff = body.staff && typeof body.staff === "object" ? (body.staff as Record<string, unknown>) : undefined;
      const saved = await saveStaffSettings(ladder, { staff: staff as never, discipline: body.discipline, rolesOn: typeof body.rolesOn === "boolean" ? body.rolesOn : undefined }, actor);
      return saved ? NextResponse.json({ ok: true, settings: { staff: saved.settings.staff, discipline: saved.settings.discipline, rolesOn: saved.settings.roles.on } }) : fail("failed", 500);
    }
    case "roles_sync": {
      if (access.role !== "admin") return fail("admins_only", 403);
      const { syncAllRoles } = await import("@/lib/ladders/roles");
      const res = await syncAllRoles(ladder);
      return res.ok ? NextResponse.json(res) : fail(res.error, res.error === "no_access" ? 403 : 409);
    }
    case "room_cancel": {
      if (typeof body.roomId !== "string") return fail("bad_request");
      const room = await cancelRoom(ladder, body.roomId, actor);
      if (!room) return fail("not_open", 409);
      await postRoomCard(ladder, room, room.queueId ? await getQueue(room.queueId) : null).catch(() => false);
      return NextResponse.json({ ok: true });
    }
    case "queue_save": {
      if (access.role !== "admin") return fail("admins_only", 403);
      if (!(await queuesReady())) return fail("not_ready", 503);
      const input = cleanQueueInput((body.queue ?? {}) as Record<string, unknown>, ladder);
      if (input.mode === "rush" && !input.rushTimes.length) return fail("no_times");
      const saved = typeof body.id === "string" ? await updateQueue(ladder, body.id, input, actor) : await createQueue(ladder, input, actor);
      if (!saved) return fail("failed", 500);
      if (saved.channelId) await postQueueCard(ladder, saved, await queueEntries(saved.id)).catch(() => "failed");
      return NextResponse.json({ ok: true, id: saved.id });
    }
    case "queue_delete": {
      if (access.role !== "admin") return fail("admins_only", 403);
      if (typeof body.id !== "string") return fail("bad_request");
      const q = await getQueue(body.id);
      if (q?.channelId && q.messageId) await compRest("DELETE", `/channels/${q.channelId}/messages/${q.messageId}`).catch(() => null);
      return (await deleteQueue(ladder, body.id, actor)) ? NextResponse.json({ ok: true }) : fail("not_found", 404);
    }
    case "queue_post": {
      if (access.role !== "admin") return fail("admins_only", 403);
      const q = typeof body.id === "string" ? await getQueue(body.id) : null;
      if (!q || q.ladderId !== ladder.id) return fail("not_found", 404);
      const res = await postQueueCard(ladder, q, await queueEntries(q.id));
      return res === "ok" ? NextResponse.json({ ok: true }) : fail(res, res === "no_access" ? 403 : 409);
    }
    case "end_season": {
      if (access.role !== "admin") return fail("admins_only", 403);
      const reset = body.reset === "soft" ? "soft" : body.reset === "full" ? "full" : null;
      if (!reset) return fail("bad_request");
      const res = await endSeason(ladder, { reset, keep: body.keep == null ? undefined : Number(body.keep) }, actor);
      return res.ok ? NextResponse.json(res) : NextResponse.json(res, { status: 409 });
    }
  }
  return fail("bad_request");
}
