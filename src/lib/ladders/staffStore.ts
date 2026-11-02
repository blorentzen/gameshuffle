import "server-only";

/**
 * GS Ranked staff tools in the database (supabase/ranked-m1.sql; lounge system picks 7A to 11A, automation picks 1 to
 * 8, name/web/docs picks 3 to 7, all as recommended). Discord and the staff page call the same functions, and every
 * action lands in the staff log with who did it and from where.
 *
 *   - Clean tables verify themselves: `assessTable` runs the checks (autoVerify.ts) when a table comes in and keeps the
 *     reasons; with the lounge's switch on, a clean table gets a time and `sweepAutoVerify` (every minute) verifies it
 *     unless someone asked for a change in the meantime.
 *   - Penalties move MMR as a Penalty line (ladder_adjustments) and can give strikes; enough active strikes start a
 *     break from the queue.
 *   - Requests (penalty reports, reduced loss, appeals, name changes) wait for staff, who accept or deny them in one
 *     tap; accepting does the thing.
 *   - Seasons end with a full reset (everyone places again) or a soft one (everyone keeps part of their distance from
 *     the middle, carried in as already placed).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { autoVerifyAt, autoVerifyCheck, type AutoCheck } from "./autoVerify";
import { activeStrikes, breakAfter, cleanDiscipline, softReset, type PenaltyKind } from "./discipline";
import { readAllPages } from "@/lib/supabase/pages";
import { nameRequestCheck } from "./playerChecks";
import { nameKey, parseRoom, roomIssues } from "./rules";
import { board, getLadder, getTable, playerNames, playersByKeys, tableRoom, updateTable, verifyTable, type LadderTable } from "./store";
import { cleanStaff, type Ladder, type StaffSettings } from "./types";

const db = () => createServiceClient();

export interface Actor { id: string; name: string; via: "discord" | "web" | "bot" }
export const BOT_ACTOR: Actor = { id: "bot", name: "GS Ranked", via: "bot" };

// ── The log ────────────────────────────────────────────────────────────────────────────────────

export async function logAction(ladder: Pick<Ladder, "id">, actor: Actor, action: string, extra: { playerId?: string | null; tableId?: string | null; detail?: Record<string, unknown> } = {}): Promise<string | null> {
  const { data, error } = await db().from("ladder_staff_log").insert({
    ladder_id: ladder.id, actor_id: actor.id.slice(0, 40), actor_name: actor.name.slice(0, 60), via: actor.via, action: action.slice(0, 40),
    player_id: extra.playerId ?? null, table_id: extra.tableId ?? null, detail: extra.detail ?? {},
  }).select("id").single();
  if (error) { console.error("[ranked] log failed:", error.message); return null; }
  return (data as { id: string }).id;
}

export interface LogRow { id: string; at: string; actor: string; via: Actor["via"]; action: string; player: string | null; table: number | null; detail: Record<string, unknown>; undone: boolean }

export async function staffLog(ladder: Ladder, limit = 100): Promise<LogRow[]> {
  const { data } = await db().from("ladder_staff_log").select("id, at, actor_name, actor_id, via, action, detail, undone_at, ladder_players(name), ladder_tables(number)")
    .eq("ladder_id", ladder.id).order("at", { ascending: false }).limit(Math.min(500, limit));
  type R = { id: string; at: string; actor_name: string | null; actor_id: string; via: Actor["via"]; action: string; detail: Record<string, unknown>; undone_at: string | null; ladder_players: { name: string } | null; ladder_tables: { number: number } | null };
  return ((data ?? []) as unknown as R[]).map((r) => ({ id: r.id, at: r.at, actor: r.actor_name ?? r.actor_id, via: r.via, action: r.action, player: r.ladder_players?.name ?? null, table: r.ladder_tables?.number ?? null, detail: r.detail ?? {}, undone: !!r.undone_at }));
}

// ── Tables: the checks, and clean tables verifying themselves ────────────────────────────────

async function openRequestsFor(tableId: string): Promise<number> {
  const { count } = await db().from("ladder_requests").select("id", { count: "exact", head: true }).eq("table_id", tableId).eq("status", "open");
  return count ?? 0;
}

/** Runs the checks on a pending table, keeps the reasons, and gives a clean table its time (when the lounge's switch is on). */
export async function assessTable(ladder: Ladder, table: LadderTable): Promise<AutoCheck> {
  const room = tableRoom(ladder, table);
  const keys = room.teams.flatMap((t) => t.players.map((p) => p.key));
  const known = new Set((await playersByKeys(ladder.id, keys)).keys());
  const names = keys.some((k) => !known.has(k)) ? await playerNames(ladder.id) : [];
  const read = table.readBody ? parseRoom(ladder.kind, table.readBody, table.format) : null;
  const check = autoVerifyCheck({ typed: room, read, issues: roomIssues(room, known, names), openRequests: await openRequestsFor(table.id), missedRaces: table.missed.length });
  const autoAt = check.clean && ladder.settings.staff.autoVerify ? autoVerifyAt(table.createdAt) : null;
  await updateTable(table.id, { checkReasons: check.reasons, autoAt });
  return check;
}

/** Every minute: verifies clean tables whose hold is over (and clears any that stopped being clean). */
export async function sweepAutoVerify(now = new Date()): Promise<number> {
  const { data } = await db().from("ladder_tables").select("id").eq("status", "pending").not("auto_at", "is", null).lte("auto_at", now.toISOString()).limit(25);
  let verified = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    const table = await getTable(id);
    if (!table || table.status !== "pending") continue;
    const ladder = await getLadder({ id: table.ladderId });
    if (!ladder) continue;
    const check = await assessTable(ladder, table);
    if (!check.clean || !ladder.settings.staff.autoVerify) continue;
    const res = await verifyTable(ladder, table, { id: BOT_ACTOR.id, name: BOT_ACTOR.name }, { auto: true });
    if (!res.ok) continue;
    verified++;
    await logAction(ladder, BOT_ACTOR, "auto_verify", { tableId: table.id, detail: { number: table.number } });
    const { postCard } = await import("./discord");
    const fresh = (await getTable(table.id))!;
    if (fresh.channelId) await postCard(ladder, fresh, { kind: "verified", result: res.result }).catch(() => null);
  }
  return verified;
}

/** Tables waiting on someone, newest first, with why; and how many verified on their own today (Pacific). */
export async function tablesNeedingSomeone(ladder: Ladder): Promise<{ waiting: LadderTable[]; autoToday: number }> {
  const { gsDayStart, gsDay } = await import("@/lib/time/gsClock");
  const { data } = await db().from("ladder_tables").select("id").eq("ladder_id", ladder.id).eq("status", "pending").order("created_at", { ascending: false }).limit(100);
  const tables = (await Promise.all(((data ?? []) as { id: string }[]).map((r) => getTable(r.id)))).filter((t): t is LadderTable => !!t);
  const { count } = await db().from("ladder_tables").select("id", { count: "exact", head: true }).eq("ladder_id", ladder.id).eq("auto_verified", true).gte("verified_at", gsDayStart(gsDay()).toISOString());
  return { waiting: tables, autoToday: count ?? 0 };
}

// ── Penalties, strikes and breaks ───────────────────────────────────────────────────────────

export type PenaltyResult =
  | { ok: true; logId: string | null; before: number; after: number; strikes: number; breakUntil: string | null }
  | { ok: false; error: "no_rating" | "failed" };

/**
 * A penalty: `mmr` off the player's number as a Penalty line (0 for a strike only) and `strikes` strikes. The amounts
 * default to the lounge's values for the kind. Reaching the break threshold starts a break.
 */
export async function givePenalty(ladder: Ladder, input: { playerId: string; kind: PenaltyKind; mmr?: number; strikes?: number; reason?: string | null; tableId?: string | null }, actor: Actor): Promise<PenaltyResult> {
  const d = ladder.settings.discipline;
  const preset = d.penalties[input.kind];
  const amount = Math.max(0, Math.round(input.mmr ?? preset.mmr));
  const strikes = Math.max(0, Math.min(5, Math.round(input.strikes ?? preset.strikes)));
  const reason = (input.reason?.trim() || preset.label).slice(0, 300);
  const now = new Date();
  let before = 0, after = 0, adjustmentId: string | null = null;
  if (amount > 0) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: r } = await db().from("ladder_ratings").select("mmr").eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", input.playerId).maybeSingle();
      if (!r) return { ok: false, error: "no_rating" };
      before = (r as { mmr: number }).mmr;
      after = Math.max(1, before - amount);
      const { data: moved } = await db().from("ladder_ratings").update({ mmr: after }).eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", input.playerId).eq("mmr", before).select("player_id");
      if (moved?.length) break;
      if (attempt === 3) return { ok: false, error: "failed" };
    }
    const { data: adj } = await db().from("ladder_adjustments").insert({
      ladder_id: ladder.id, season: ladder.season, player_id: input.playerId, kind: "penalty", mmr_before: before, delta: after - before, mmr_after: after,
      reason, at: now.toISOString(), by_id: actor.id, by_name: actor.name,
    }).select("id").single();
    adjustmentId = (adj as { id: string } | null)?.id ?? null;
  }
  const logId = await logAction(ladder, actor, "penalty", { playerId: input.playerId, tableId: input.tableId ?? null, detail: { kind: input.kind, mmr: amount, strikes, reason, before, after, adjustmentId } });
  let breakUntil: string | null = null;
  if (strikes > 0) {
    const past = await strikesFor(ladder, input.playerId);
    await db().from("ladder_strikes").insert({ ladder_id: ladder.id, player_id: input.playerId, count: strikes, reason, at: now.toISOString(), expires_at: new Date(now.getTime() + d.strikeDays * 86_400_000).toISOString(), adjustment_id: adjustmentId, log_id: logId });
    const until = breakAfter(past, strikes, d, now);
    if (until) {
      breakUntil = until.toISOString();
      await db().from("ladder_breaks").insert({ ladder_id: ladder.id, player_id: input.playerId, until: breakUntil, reason: `${d.breakAt} strikes`, by_id: actor.id });
      await logAction(ladder, actor, "break", { playerId: input.playerId, detail: { until: breakUntil, days: d.breakDays } });
    }
  }
  if (amount > 0 && ladder.settings.roles.on) { const { rolesAfter } = await import("./roles"); await rolesAfter(ladder, [input.playerId]); }
  // The player hears about it in their direct messages (closed DMs just mean they see it on the lounge's page).
  const { data: who } = await db().from("ladder_players").select("discord_id").eq("id", input.playerId).maybeSingle();
  const discordId = (who as { discord_id: string | null } | null)?.discord_id;
  if (discordId) {
    const { dmPenalty } = await import("./discord");
    await dmPenalty(ladder, discordId, { label: preset.label, reason, before, after, strikes, breakUntil }).catch(() => false);
  }
  return { ok: true, logId, before, after, strikes, breakUntil };
}

async function strikesFor(ladder: Ladder, playerId: string): Promise<{ at: string; count: number; undone: boolean }[]> {
  const { data } = await db().from("ladder_strikes").select("at, count, undone_at").eq("ladder_id", ladder.id).eq("player_id", playerId).order("at", { ascending: false }).limit(50);
  return ((data ?? []) as { at: string; count: number; undone_at: string | null }[]).map((s) => ({ at: s.at, count: s.count, undone: !!s.undone_at }));
}

/** Takes a penalty back: its MMR returns (as a Bonus line) and its strikes stop counting. */
export async function undoPenalty(ladder: Ladder, logId: string, actor: Actor): Promise<"ok" | "missing" | "already"> {
  const { data } = await db().from("ladder_staff_log").select("id, action, player_id, detail, undone_at").eq("id", logId).eq("ladder_id", ladder.id).maybeSingle();
  const row = data as { id: string; action: string; player_id: string | null; detail: { mmr?: number; adjustmentId?: string | null }; undone_at: string | null } | null;
  if (!row || row.action !== "penalty" || !row.player_id) return "missing";
  if (row.undone_at) return "already";
  const amount = row.detail.mmr ?? 0;
  if (amount > 0) {
    const { data: r } = await db().from("ladder_ratings").select("mmr").eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", row.player_id).maybeSingle();
    if (r) {
      const before = (r as { mmr: number }).mmr;
      const after = before + amount;
      await db().from("ladder_ratings").update({ mmr: after }).eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", row.player_id).eq("mmr", before);
      await db().from("ladder_adjustments").insert({ ladder_id: ladder.id, season: ladder.season, player_id: row.player_id, kind: "bonus", mmr_before: before, delta: amount, mmr_after: after, reason: "A penalty taken back", by_id: actor.id, by_name: actor.name });
    }
  }
  await db().from("ladder_strikes").update({ undone_at: new Date().toISOString() }).eq("log_id", row.id).is("undone_at", null);
  await db().from("ladder_staff_log").update({ undone_at: new Date().toISOString(), undone_by: actor.name }).eq("id", row.id);
  await logAction(ladder, actor, "penalty_undo", { playerId: row.player_id, detail: { of: row.id, mmr: amount } });
  if (amount > 0 && ladder.settings.roles.on) { const { rolesAfter } = await import("./roles"); await rolesAfter(ladder, [row.player_id]); }
  return "ok";
}

export interface PlayerDiscipline { strikes: number; strikeList: { at: string; count: number; reason: string | null; expiresAt: string }[]; breakUntil: string | null }

export async function playerDiscipline(ladder: Ladder, playerId: string, now = new Date()): Promise<PlayerDiscipline> {
  const [{ data: s }, { data: b }] = await Promise.all([
    db().from("ladder_strikes").select("at, count, reason, expires_at, undone_at").eq("ladder_id", ladder.id).eq("player_id", playerId).is("undone_at", null).gt("expires_at", now.toISOString()).order("at", { ascending: false }),
    db().from("ladder_breaks").select("until").eq("ladder_id", ladder.id).eq("player_id", playerId).is("ended_at", null).gt("until", now.toISOString()).order("until", { ascending: false }).limit(1),
  ]);
  const list = ((s ?? []) as { at: string; count: number; reason: string | null; expires_at: string }[]).map((x) => ({ at: x.at, count: x.count, reason: x.reason, expiresAt: x.expires_at }));
  return { strikes: activeStrikes(list.map((x) => ({ at: x.at, count: x.count })), { strikeDays: 3650 }, now), strikeList: list, breakUntil: ((b ?? []) as { until: string }[])[0]?.until ?? null };
}

/** Everyone with active strikes or a break right now, for the staff page. */
export async function disciplineBoard(ladder: Ladder, now = new Date()): Promise<{ playerId: string; name: string; strikes: number; breakUntil: string | null }[]> {
  const [{ data: s }, { data: b }] = await Promise.all([
    db().from("ladder_strikes").select("player_id, count, ladder_players(name)").eq("ladder_id", ladder.id).is("undone_at", null).gt("expires_at", now.toISOString()).limit(500),
    db().from("ladder_breaks").select("player_id, until, ladder_players(name)").eq("ladder_id", ladder.id).is("ended_at", null).gt("until", now.toISOString()).limit(200),
  ]);
  const out = new Map<string, { playerId: string; name: string; strikes: number; breakUntil: string | null }>();
  for (const r of (s ?? []) as unknown as { player_id: string; count: number; ladder_players: { name: string } | null }[]) {
    const e = out.get(r.player_id) ?? { playerId: r.player_id, name: r.ladder_players?.name ?? "?", strikes: 0, breakUntil: null };
    e.strikes += r.count; out.set(r.player_id, e);
  }
  for (const r of (b ?? []) as unknown as { player_id: string; until: string; ladder_players: { name: string } | null }[]) {
    const e = out.get(r.player_id) ?? { playerId: r.player_id, name: r.ladder_players?.name ?? "?", strikes: 0, breakUntil: null };
    e.breakUntil = r.until; out.set(r.player_id, e);
  }
  return [...out.values()].sort((a, b) => Number(!!b.breakUntil) - Number(!!a.breakUntil) || b.strikes - a.strikes);
}

export async function endBreak(ladder: Ladder, playerId: string, actor: Actor): Promise<boolean> {
  const { data } = await db().from("ladder_breaks").update({ ended_at: new Date().toISOString() }).eq("ladder_id", ladder.id).eq("player_id", playerId).is("ended_at", null).select("id");
  if (data?.length) await logAction(ladder, actor, "break_end", { playerId });
  return !!data?.length;
}

// ── Requests ────────────────────────────────────────────────────────────────────────────────

export type RequestKind = "penalty" | "reduce" | "appeal" | "name" | "join";
export interface LadderRequest {
  id: string; kind: RequestKind; status: "open" | "accepted" | "denied" | "withdrawn"; playerId: string | null; player: string | null; tableId: string | null; table: number | null;
  byId: string; byName: string | null; body: Record<string, unknown>; note: string | null; createdAt: string; decidedName: string | null;
}

export async function createRequest(ladder: Ladder, input: { kind: RequestKind; playerId?: string | null; tableId?: string | null; by: { id: string; name: string }; body: Record<string, unknown> }): Promise<string | null> {
  const { data, error } = await db().from("ladder_requests").insert({
    ladder_id: ladder.id, kind: input.kind, player_id: input.playerId ?? null, table_id: input.tableId ?? null, by_id: input.by.id, by_name: input.by.name.slice(0, 60), body: input.body,
  }).select("id").single();
  if (error) { console.error("[ranked] request failed:", error.message); return null; }
  // A request on a waiting table stops it verifying on its own.
  if (input.tableId) { const t = await getTable(input.tableId); if (t && t.status === "pending") await assessTable(ladder, t); }
  return (data as { id: string }).id;
}

export async function listRequests(ladder: Ladder, status: "open" | "closed" = "open", limit = 100): Promise<LadderRequest[]> {
  let q = db().from("ladder_requests").select("id, kind, status, player_id, table_id, by_id, by_name, body, note, created_at, decided_name, ladder_players(name), ladder_tables(number)").eq("ladder_id", ladder.id);
  q = status === "open" ? q.eq("status", "open") : q.neq("status", "open");
  const { data } = await q.order("created_at", { ascending: status === "open" }).limit(limit);
  type R = { id: string; kind: RequestKind; status: LadderRequest["status"]; player_id: string | null; table_id: string | null; by_id: string; by_name: string | null; body: Record<string, unknown>; note: string | null; created_at: string; decided_name: string | null; ladder_players: { name: string } | null; ladder_tables: { number: number } | null };
  return ((data ?? []) as unknown as R[]).map((r) => ({
    id: r.id, kind: r.kind, status: r.status, playerId: r.player_id, player: r.ladder_players?.name ?? null, tableId: r.table_id, table: r.ladder_tables?.number ?? null,
    byId: r.by_id, byName: r.by_name, body: r.body ?? {}, note: r.note, createdAt: r.created_at, decidedName: r.decided_name,
  }));
}

/** Accepts or denies a request; accepting does the thing (a penalty, reduced loss, a penalty undone, a new name). */
export async function decideRequest(ladder: Ladder, id: string, accept: boolean, actor: Actor, note: string | null = null): Promise<"ok" | "missing" | "decided" | "failed"> {
  const { data } = await db().from("ladder_requests").select("id, kind, status, player_id, table_id, body").eq("id", id).eq("ladder_id", ladder.id).maybeSingle();
  const r = data as { id: string; kind: RequestKind; status: string; player_id: string | null; table_id: string | null; body: Record<string, unknown> } | null;
  if (!r) return "missing";
  if (r.status !== "open") return "decided";
  if (accept) {
    if (r.kind === "penalty" && r.player_id) {
      const kind = (["late", "drop_before", "drop_during", "tag", "other"].includes(String(r.body.penalty)) ? r.body.penalty : "other") as PenaltyKind;
      const res = await givePenalty(ladder, { playerId: r.player_id, kind, reason: typeof r.body.reason === "string" ? r.body.reason : null, tableId: r.table_id }, actor);
      if (!res.ok && res.error === "failed") return "failed";
    } else if (r.kind === "reduce" && r.table_id) {
      const t = await getTable(r.table_id);
      const missed = Array.isArray(r.body.missed) ? (r.body.missed as { key: string; races: number }[]) : [];
      if (t && t.status === "pending") await updateTable(t.id, { missed: [...t.missed.filter((m) => !missed.some((x) => x.key === m.key)), ...missed] });
    } else if (r.kind === "appeal" && typeof r.body.logId === "string") {
      await undoPenalty(ladder, r.body.logId, actor);
    } else if (r.kind === "name" && r.player_id && typeof r.body.name === "string") {
      const done = await renamePlayer(ladder, r.player_id, r.body.name, actor);
      if (done !== "ok") return "failed";
    } else if (r.kind === "join") {
      const { acceptJoin } = await import("./joinStore");
      const done = await acceptJoin(ladder, r.body, actor);
      if (done !== "ok") return "failed";
    }
  }
  await db().from("ladder_requests").update({ status: accept ? "accepted" : "denied", decided_by: actor.id, decided_name: actor.name, decided_at: new Date().toISOString(), note }).eq("id", id).eq("status", "open");
  await logAction(ladder, actor, accept ? "request_accept" : "request_deny", { playerId: r.player_id, tableId: r.table_id, detail: { kind: r.kind, note } });
  if (r.table_id) { const t = await getTable(r.table_id); if (t && t.status === "pending") await assessTable(ladder, t); }
  return "ok";
}

// ── Names ───────────────────────────────────────────────────────────────────────────────────

/** Renames a player (their old name is kept with their earlier names). */
export async function renamePlayer(ladder: Ladder, playerId: string, name: string, actor: Actor): Promise<"ok" | "taken" | "missing"> {
  const clean = name.trim().slice(0, 32);
  const { data } = await db().from("ladder_players").select("name, earlier_names").eq("id", playerId).eq("ladder_id", ladder.id).maybeSingle();
  const p = data as { name: string; earlier_names: string[] | null } | null;
  if (!p) return "missing";
  const { error } = await db().from("ladder_players").update({
    name: clean, name_key: nameKey(clean), earlier_names: [...new Set([p.name, ...(p.earlier_names ?? [])])].slice(0, 10), name_changed_at: new Date().toISOString(),
  }).eq("id", playerId);
  if (error) return error.code === "23505" ? "taken" : "missing";
  await logAction(ladder, actor, "rename", { playerId, detail: { from: p.name, to: clean } });
  return "ok";
}

export type NameAsk = { ok: true; approved: true } | { ok: true; approved: false; requestId: string | null; why: string } | { ok: false; text: string };

/** A player asks for a new name: approved on the spot when it's clean and the lounge allows it, else a request for staff. */
export async function requestName(ladder: Ladder, playerId: string, name: string, by: { id: string; name: string }, via: Actor["via"]): Promise<NameAsk> {
  const { data } = await db().from("ladder_players").select("name, name_changed_at").eq("id", playerId).eq("ladder_id", ladder.id).maybeSingle();
  const p = data as { name: string; name_changed_at: string | null } | null;
  if (!p) return { ok: false, text: "You're not on this lounge yet." };
  const check = nameRequestCheck({ name, current: p.name, lastChangeAt: p.name_changed_at, others: await playerNames(ladder.id), filterOk: !isBlockedText(name), now: new Date() });
  if (!check.ok && check.to === "player") return { ok: false, text: check.text };
  if (check.ok && ladder.settings.staff.autoNames) {
    const done = await renamePlayer(ladder, playerId, name, { id: by.id, name: by.name, via });
    return done === "ok" ? { ok: true, approved: true } : { ok: false, text: "Someone on this lounge already has that name." };
  }
  const requestId = await createRequest(ladder, { kind: "name", playerId, by, body: { name: name.trim().slice(0, 32), from: p.name, why: check.ok ? null : check.text } });
  return { ok: true, approved: false, requestId, why: check.ok ? "Staff approve name changes on this lounge." : check.text };
}

// ── Players ─────────────────────────────────────────────────────────────────────────────────

export interface StaffPlayer { id: string; name: string; discordId: string | null; mmr: number | null; events: number; earlierNames: string[] }

/** Players whose name (or an earlier name) contains `q`, with this season's MMR. */
export async function searchPlayers(ladder: Ladder, q: string, limit = 12): Promise<StaffPlayer[]> {
  const term = q.trim().replace(/[%_,()]/g, "").slice(0, 32);
  if (term.length < 2) return [];
  const { data } = await db().from("ladder_players").select("id, name, discord_id, earlier_names").eq("ladder_id", ladder.id).ilike("name", `%${term}%`).order("name").limit(limit);
  const rows = (data ?? []) as { id: string; name: string; discord_id: string | null; earlier_names: string[] | null }[];
  if (!rows.length) return [];
  const { data: r } = await db().from("ladder_ratings").select("player_id, mmr, events").eq("ladder_id", ladder.id).eq("season", ladder.season).in("player_id", rows.map((x) => x.id));
  const rating = new Map(((r ?? []) as { player_id: string; mmr: number; events: number }[]).map((x) => [x.player_id, x]));
  return rows.map((x) => ({ id: x.id, name: x.name, discordId: x.discord_id, mmr: rating.get(x.id)?.mmr ?? null, events: rating.get(x.id)?.events ?? 0, earlierNames: x.earlier_names ?? [] }));
}

// ── Seasons ─────────────────────────────────────────────────────────────────────────────────

export type SeasonEnd =
  | { ok: true; season: number; carried: number; middle: number | null }
  | { ok: false; error: "pending" | "moved" | "failed"; waiting?: number };

/**
 * Ends the season and starts the next. Full: everyone starts over and places again. Soft: everyone rated keeps `keep`
 * of their distance from the season's median and starts the new season already placed. Tables still waiting have to
 * be verified or sent back first, since they belong to the season they were played in.
 */
export async function endSeason(ladder: Ladder, input: { reset: "full" | "soft"; keep?: number }, actor: Actor): Promise<SeasonEnd> {
  const { count: waiting } = await db().from("ladder_tables").select("id", { count: "exact", head: true }).eq("ladder_id", ladder.id).eq("season", ladder.season).eq("status", "pending");
  if (waiting) return { ok: false, error: "pending", waiting };
  const next = ladder.season + 1;
  if (next > 999) return { ok: false, error: "failed" };
  const now = new Date().toISOString();
  const [{ rows: top, total: players }, { count: tables }] = await Promise.all([
    board(ladder, { season: ladder.season, limit: 5 }),
    db().from("ladder_tables").select("id", { count: "exact", head: true }).eq("ladder_id", ladder.id).eq("season", ladder.season).eq("status", "verified"),
  ]);
  let carried = 0, middle: number | null = null;
  if (input.reset === "soft") {
    const keep = Math.max(0.1, Math.min(0.9, input.keep ?? 0.5));
    const { data, error } = await readAllPages<{ player_id: string; mmr: number }>((from, to) => db().from("ladder_ratings").select("player_id, mmr").eq("ladder_id", ladder.id).eq("season", ladder.season).order("player_id").range(from, to));
    if (error) return { ok: false, error: "failed" };
    const sorted = data.map((r) => r.mmr).sort((a, b) => a - b);
    middle = sorted.length ? sorted[Math.floor(sorted.length / 2)] : ladder.settings.start;
    const rows = data.map((r) => { const mmr = softReset(r.mmr, middle!, keep); return { ladder_id: ladder.id, season: next, player_id: r.player_id, mmr, peak: mmr, events: 0, wins: 0, carried: true }; });
    for (let i = 0; i < rows.length; i += 1000) {
      const { error: insErr } = await db().from("ladder_ratings").upsert(rows.slice(i, i + 1000), { onConflict: "ladder_id,season,player_id", ignoreDuplicates: true });
      if (insErr) { await db().from("ladder_ratings").delete().eq("ladder_id", ladder.id).eq("season", next).eq("carried", true); return { ok: false, error: "failed" }; }
    }
    carried = rows.length;
  }
  const { data: moved } = await db().from("ladders").update({ season: next }).eq("id", ladder.id).eq("season", ladder.season).select("id");
  if (!moved?.length) {
    if (carried) await db().from("ladder_ratings").delete().eq("ladder_id", ladder.id).eq("season", next).eq("carried", true);
    return { ok: false, error: "moved" };
  }
  await db().from("ladder_seasons").upsert({ ladder_id: ladder.id, season: ladder.season, ended_at: now }, { onConflict: "ladder_id,season" });
  await db().from("ladder_seasons").upsert({ ladder_id: ladder.id, season: next, started_at: now }, { onConflict: "ladder_id,season" });
  await logAction(ladder, actor, "season_end", { detail: { season: ladder.season, next, reset: input.reset, keep: input.keep ?? null, carried, middle } });
  const { postSeasonEnd } = await import("./discord");
  const keep = input.reset === "soft" ? Math.max(0.1, Math.min(0.9, input.keep ?? 0.5)) : null;
  await postSeasonEnd(ladder, {
    season: ladder.season, players, tables: tables ?? 0, top: top.map((r) => ({ name: r.name, mmr: r.mmr })), reset: input.reset, keep, middle,
    championStart: top[0] && middle != null && keep != null ? softReset(top[0].mmr, middle, keep) : null,
  }).catch(() => false);
  if (ladder.settings.roles.on) { const { syncAllRoles } = await import("./roles"); await syncAllRoles({ ...ladder, season: next }).catch(() => null); }
  return { ok: true, season: next, carried, middle };
}

// ── Settings ────────────────────────────────────────────────────────────────────────────────

/**
 * Saves how staff work and the discipline numbers. Turning clean tables verifying themselves on or off re-checks the
 * tables waiting now, so they get (or lose) their time straight away.
 */
export async function saveStaffSettings(ladder: Ladder, patch: { staff?: Partial<StaffSettings>; discipline?: unknown; rolesOn?: boolean }, actor: Actor): Promise<Ladder | null> {
  const settings = {
    ...ladder.settings,
    roles: patch.rolesOn === undefined ? ladder.settings.roles : { ...ladder.settings.roles, on: patch.rolesOn },
    staff: patch.staff ? cleanStaff({ ...ladder.settings.staff, ...patch.staff }) : ladder.settings.staff,
    discipline: patch.discipline !== undefined ? cleanDiscipline(patch.discipline) : ladder.settings.discipline,
  };
  const { error } = await db().from("ladders").update({ settings }).eq("id", ladder.id);
  if (error) { console.error("[ranked] settings failed:", error.message); return null; }
  const fresh = { ...ladder, settings };
  await logAction(ladder, actor, "settings", { detail: { changed: Object.keys(patch) } });
  if (settings.staff.autoVerify !== ladder.settings.staff.autoVerify) {
    const { data } = await db().from("ladder_tables").select("id").eq("ladder_id", ladder.id).eq("status", "pending").limit(100);
    for (const { id } of (data ?? []) as { id: string }[]) { const t = await getTable(id); if (t) await assessTable(fresh, t); }
  }
  return fresh;
}

// ── A player's own view ─────────────────────────────────────────────────────────────────────

export interface OwnPenalty { logId: string; at: string; mmr: number; strikes: number; reason: string | null; undone: boolean; appealed: boolean }

/** A player's penalties this season and earlier, newest first, and whether each has an appeal waiting. */
export async function playerPenalties(ladder: Ladder, playerId: string): Promise<OwnPenalty[]> {
  const [{ data: logs }, { data: appeals }] = await Promise.all([
    db().from("ladder_staff_log").select("id, at, detail, undone_at").eq("ladder_id", ladder.id).eq("player_id", playerId).eq("action", "penalty").order("at", { ascending: false }).limit(50),
    db().from("ladder_requests").select("body").eq("ladder_id", ladder.id).eq("player_id", playerId).eq("kind", "appeal").eq("status", "open"),
  ]);
  const waiting = new Set(((appeals ?? []) as { body: { logId?: string } }[]).map((a) => a.body?.logId).filter(Boolean));
  return ((logs ?? []) as { id: string; at: string; detail: { mmr?: number; strikes?: number; reason?: string }; undone_at: string | null }[]).map((l) => ({
    logId: l.id, at: l.at, mmr: l.detail?.mmr ?? 0, strikes: l.detail?.strikes ?? 0, reason: l.detail?.reason ?? null, undone: !!l.undone_at, appealed: waiting.has(l.id),
  }));
}
