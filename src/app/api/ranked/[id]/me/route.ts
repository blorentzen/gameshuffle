/**
 * GET/POST /api/ranked/[id]/me: a player's own side of a lounge on the web (name, web and docs pick 7A). Signed in with
 * Discord linked; the bot reads their roles in the lounge's server for who may submit.
 *
 *   GET                       who you are here: your player, MMR, strikes and break, penalties, tables waiting on you
 *   POST (multipart)          submit a table: format, tier, body, missed, shot (an image, up to 8 MB)
 *   POST { action: "link" }   claim your name on the lounge (it gets your Discord)
 *   POST { action: "join" }   a new player asks to join under a name
 *   POST { action: "name" }   ask for a new name
 *   POST { action: "appeal" } appeal a penalty
 *   POST { action: "send" | "fix" | "cancel" }  your own waiting table: send it anyway, change its text, or cancel it
 */

import { after, NextResponse } from "next/server";
import { roomTableIn } from "@/lib/discord/commands/rankedQueue";
import { createServiceClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { rankedAccess, type RankedAccess } from "@/lib/ladders/access";
import { intakeTable } from "@/lib/ladders/intake";
import { createRequest, playerDiscipline, playerPenalties, requestName } from "@/lib/ladders/staffStore";
import { getLadder, getTable, laddersReady, linkDiscord, placedEvents, playerForDiscord, updateTable, denyTable, type LadderTable } from "@/lib/ladders/store";
import { checkAndSend, submitTable, type SubmitOutcome } from "@/lib/ladders/submit";
import { startFromMkc } from "@/lib/ladders/mkcStart";
import { askToJoin } from "@/lib/ladders/joinStore";
import { divisionFor, tableTitle } from "@/lib/ladders/rules";
import type { Ladder } from "@/lib/ladders/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const MAX_SHOT = 8 * 1024 * 1024;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function gate(ctx: Ctx): Promise<{ ladder: Ladder; access: RankedAccess } | NextResponse> {
  if (!(await laddersReady())) return fail("not_ready", 503);
  const ladder = await getLadder({ id: (await ctx.params).id });
  if (!ladder) return fail("not_found", 404);
  const access = await rankedAccess(ladder);
  if (!access.userId) return fail("signin", 401);
  return { ladder, access };
}

const canSubmit = (a: RankedAccess) => a.role === "admin" || a.role === "updater" || a.role === "reporter";

function outcomeView(ladder: Ladder, o: SubmitOutcome) {
  return {
    table: { id: o.table.id, number: o.table.number, title: tableTitle(o.table, ladder.kind), autoAt: o.table.autoAt, body: o.table.body },
    issues: o.issues, notes: o.notes, sent: o.sent, postError: o.postError,
    blocked: o.issues.some((i) => i.level === "blocking"),
  };
}

export async function GET(_request: Request, ctx: Ctx) {
  const g = await gate(ctx);
  if (g instanceof NextResponse) return g;
  const { ladder, access } = g;
  const base = { name: access.name, role: access.role, staff: access.staff, why: access.why, canSubmit: canSubmit(access), discord: !!access.discordId };
  if (!access.discordId) return NextResponse.json({ you: base, player: null });
  const player = await playerForDiscord(ladder.id, access.discordId);
  const db = createServiceClient();
  const { data: mine } = await db.from("ladder_tables").select("id, number, format, tier, created_at, message_id").eq("ladder_id", ladder.id).eq("status", "pending").eq("submitted_by", access.discordId).order("created_at", { ascending: false }).limit(10);
  const waiting = ((mine ?? []) as { id: string; number: number; format: number; tier: string | null; created_at: string; message_id: string | null }[]).map((t) => ({ id: t.id, title: tableTitle(t, ladder.kind), createdAt: t.created_at }));
  if (!player) return NextResponse.json({ you: base, player: null, waiting });
  const [{ data: r }, discipline, penalties, { data: nameAsk }] = await Promise.all([
    db.from("ladder_ratings").select("mmr, events, carried").eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", player.id).maybeSingle(),
    playerDiscipline(ladder, player.id),
    playerPenalties(ladder, player.id),
    db.from("ladder_requests").select("body").eq("ladder_id", ladder.id).eq("player_id", player.id).eq("kind", "name").eq("status", "open").limit(1),
  ]);
  const rating = r as { mmr: number; events: number; carried: boolean | null } | null;
  return NextResponse.json({
    you: base,
    player: {
      id: player.id, name: player.name,
      mmr: rating?.mmr ?? null, events: rating?.events ?? 0,
      division: rating ? divisionFor(rating.mmr, placedEvents(rating, ladder.settings), ladder.settings).division : null,
      strikes: discipline.strikes, breakUntil: discipline.breakUntil,
      nameAsked: ((nameAsk ?? []) as { body: { name?: string } }[])[0]?.body?.name ?? null,
    },
    penalties,
    waiting,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const g = await gate(ctx);
  if (g instanceof NextResponse) return g;
  const { ladder, access } = g;
  if (!access.discordId) return fail("no_discord", 403);
  const by = { id: access.discordId, name: access.name };

  // Submit: multipart with the screenshot.
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    if (!canSubmit(access)) return fail("not_reporter", 403);
    if (!(await rateLimit(`ranked-submit:${access.userId}`, { max: 12, windowMs: 10 * 60_000 })).ok) return fail("slow_down", 429);
    const form = await request.formData().catch(() => null);
    if (!form) return fail("bad_request");
    const file = form.get("shot");
    let shot: { bytes: Uint8Array; contentType: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_SHOT) return fail("too_big", 413);
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return fail("not_image", 415);
      shot = { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
    }
    const res = await submitTable(ladder, {
      format: Number(form.get("format") ?? 1), tier: String(form.get("tier") ?? ""), text: String(form.get("body") ?? ""),
      shot, missedText: String(form.get("missed") ?? "").slice(0, 200), by, userId: access.userId,
    });
    if (!res.ok) return fail(res.error, res.error === "save_failed" ? 500 : 422);
    // A table from a queue room finishes the room (its card says so).
    const room = String(form.get("room") ?? "");
    if (/^[0-9a-f-]{36}$/.test(room)) after(async () => { await roomTableIn(ladder, room, res.outcome.table.id).catch(() => null); });
    return NextResponse.json({ ok: true, ...outcomeView(ladder, res.outcome) });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const ownTable = async (): Promise<LadderTable | null> => {
    const t = typeof body.tableId === "string" ? await getTable(body.tableId) : null;
    return t && t.ladderId === ladder.id && (t.submittedBy === access.discordId || access.staff) ? t : null;
  };

  switch (body.action) {
    case "link": {
      const res = await linkDiscord(ladder.id, access.discordId, text(body.name, 32));
      if (res !== "ok") return fail(res, res === "unknown" ? 404 : 409);
      const player = await playerForDiscord(ladder.id, access.discordId);
      const start = player ? await startFromMkc(ladder, player).catch(() => null) : null;
      return NextResponse.json({ ok: true, line: start?.line ?? null });
    }
    case "join": {
      const res = await askToJoin(ladder, by, text(body.name, 32));
      return res.ok ? NextResponse.json({ ok: true, joined: res.joined, line: res.joined ? res.line : null, why: res.joined ? null : res.why }) : NextResponse.json({ error: "refused", text: res.text }, { status: 422 });
    }
    case "name": {
      const player = await playerForDiscord(ladder.id, access.discordId);
      if (!player) return fail("not_player", 404);
      const res = await requestName(ladder, player.id, text(body.name, 32), by, "web");
      return res.ok ? NextResponse.json(res) : NextResponse.json({ error: "refused", text: res.text }, { status: 422 });
    }
    case "appeal": {
      const player = await playerForDiscord(ladder.id, access.discordId);
      if (!player || typeof body.logId !== "string") return fail("bad_request");
      const own = (await playerPenalties(ladder, player.id)).find((p) => p.logId === body.logId);
      if (!own || own.undone) return fail("not_found", 404);
      if (own.appealed) return fail("already", 409);
      const id = await createRequest(ladder, { kind: "appeal", playerId: player.id, by, body: { logId: own.logId, text: text(body.text, 600) || null } });
      return id ? NextResponse.json({ ok: true }) : fail("failed", 500);
    }
    case "send": {
      const t = await ownTable();
      if (!t || t.status !== "pending") return fail("not_pending", 409);
      const o = await checkAndSend(ladder, t, [], true);
      return NextResponse.json({ ok: true, ...outcomeView(ladder, o) });
    }
    case "fix": {
      const t = await ownTable();
      const next = text(body.body, 4000);
      if (!t || t.status !== "pending") return fail("not_pending", 409);
      if (!next) return fail("empty");
      await updateTable(t.id, { body: next });
      const { table, notes } = await intakeTable(ladder, (await getTable(t.id))!, { readBody: t.readBody });
      return NextResponse.json({ ok: true, ...outcomeView(ladder, await checkAndSend(ladder, table, notes)) });
    }
    case "cancel": {
      const t = await ownTable();
      if (!t || t.status !== "pending") return fail("not_pending", 409);
      if (t.messageId) return fail("sent", 409);
      return (await denyTable(t, by, "Canceled by the reporter.")) ? NextResponse.json({ ok: true }) : fail("not_pending", 409);
    }
  }
  return fail("bad_request");
}
