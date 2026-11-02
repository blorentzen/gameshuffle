import "server-only";

/**
 * Writing a lounge's history into a ladder (history import picks 2026-11-01, picks 10A and 12A; supabase/ladders-m2.sql).
 * The Platform import screen works the plan out in the browser (importPlan.ts) and sends it in pieces: start (players,
 * which seasons, the ladder as it was), tables with their changes, penalties and ratings, then finish (seasons, the
 * ladder's season, the 200 Lounge rules and divisions). A piece that fails undoes the whole import.
 *
 * An import only fills seasons with no tables played on GameShuffle; importing a season again replaces it; Undo
 * removes everything one import added and puts the ladder's season, settings and table count back.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { LOUNGE200_PLACEMENT } from "./lounge200";
import { cleanSettings, type Ladder, type LadderSettings } from "./types";
import type { ExistingPlayer, PlanCounts, PlanPlayer } from "./importPlan";

const db = () => createServiceClient();

let ready: { at: number; ok: boolean } | null = null;
/** Whether ladders-m2.sql has run (kept for a minute either way). */
export async function importReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.ok;
  const { error } = await db().from("ladder_imports").select("id").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

/** The ladder's players, for the plan's matching and name clashes. */
export async function existingPlayers(ladderId: string): Promise<ExistingPlayer[]> {
  const { data } = await readAllPages<{ id: string; name: string; name_key: string; discord_id: string | null }>(
    (from, to) => db().from("ladder_players").select("id, name, name_key, discord_id").eq("ladder_id", ladderId).order("id").range(from, to), 50_000);
  return data.map((r) => ({ id: r.id, name: r.name, key: r.name_key, discordId: r.discord_id }));
}

/** Seasons with tables played on GameShuffle (pending or verified): an import can't fill these. */
export async function seasonsWithOwnTables(ladderId: string): Promise<number[]> {
  const { data } = await db().from("ladder_tables").select("season").eq("ladder_id", ladderId).is("import_id", null).in("status", ["pending", "verified"]).limit(5000);
  return [...new Set(((data ?? []) as { season: number }[]).map((r) => r.season))].sort((a, b) => a - b);
}

export interface ImportRow {
  id: string; ladderId: string; seasons: number[]; files: string[]; counts: Partial<PlanCounts>; status: "writing" | "done" | "undone" | "failed";
  createdByName: string | null; createdAt: string; finishedAt: string | null; undoneAt: string | null;
}
type Row = { id: string; ladder_id: string; seasons: number[]; files: string[]; counts: Partial<PlanCounts>; status: ImportRow["status"]; created_by_name: string | null; created_at: string; finished_at: string | null; undone_at: string | null; before?: Before };
type Before = { season: number; settings: LadderSettings; tableCount: number; afterCount?: number };
const toImport = (r: Row): ImportRow => ({ id: r.id, ladderId: r.ladder_id, seasons: r.seasons ?? [], files: r.files ?? [], counts: r.counts ?? {}, status: r.status, createdByName: r.created_by_name, createdAt: r.created_at, finishedAt: r.finished_at, undoneAt: r.undone_at });

export async function listImports(ladderIds?: string[]): Promise<ImportRow[]> {
  let q = db().from("ladder_imports").select("id, ladder_id, seasons, files, counts, status, created_by_name, created_at, finished_at, undone_at").order("created_at", { ascending: false }).limit(100);
  if (ladderIds) q = q.in("ladder_id", ladderIds);
  const { data } = await q;
  return ((data ?? []) as Row[]).map(toImport);
}

async function importRow(id: string): Promise<(ImportRow & { before: Before | null }) | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db().from("ladder_imports").select("id, ladder_id, seasons, files, counts, status, created_by_name, created_at, finished_at, undone_at, before").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Row;
  return { ...toImport(r), before: r.before && typeof r.before === "object" && "season" in r.before ? r.before : null };
}

/** Removes every imported row in these seasons (an earlier import of the same seasons). */
async function clearImportedSeasons(ladderId: string, seasons: number[]): Promise<void> {
  if (!seasons.length) return;
  await db().from("ladder_tables").delete().eq("ladder_id", ladderId).in("season", seasons).not("import_id", "is", null);
  await db().from("ladder_adjustments").delete().eq("ladder_id", ladderId).in("season", seasons).not("import_id", "is", null);
  await db().from("ladder_ratings").delete().eq("ladder_id", ladderId).in("season", seasons);
  await db().from("ladder_seasons").delete().eq("ladder_id", ladderId).in("season", seasons).eq("source", "import");
}

export type StartResult =
  | { ok: true; importId: string; playerIds: string[]; firstNumber: number }
  | { ok: false; error: "not_ready" | "own_tables" | "failed"; seasons?: number[]; message?: string };

/**
 * Starts an import: checks the seasons, clears an earlier import of them, records the import, writes the players and
 * reserves the table numbers. `players` come from the plan in its order; the ids come back in the same order.
 */
export async function startImport(ladder: Ladder, input: { seasons: number[]; files: string[]; counts: PlanCounts; tables: number; players: PlanPlayer[]; by: { id: string; name: string } }): Promise<StartResult> {
  if (!(await importReady())) return { ok: false, error: "not_ready" };
  const own = (await seasonsWithOwnTables(ladder.id)).filter((s) => input.seasons.includes(s));
  if (own.length) return { ok: false, error: "own_tables", seasons: own };
  await clearImportedSeasons(ladder.id, input.seasons);

  const before: Before = { season: ladder.season, settings: ladder.settings, tableCount: ladder.tableCount };
  const { data: imp, error: impErr } = await db().from("ladder_imports").insert({
    ladder_id: ladder.id, seasons: input.seasons, files: input.files.slice(0, 20).map((f) => f.slice(0, 120)), counts: input.counts, before,
    created_by: input.by.id, created_by_name: input.by.name.slice(0, 60),
  }).select("id").single();
  if (impErr || !imp) { console.error("[ladder import] start failed:", impErr?.message); return { ok: false, error: "failed" }; }
  const importId = (imp as { id: string }).id;

  try {
    const playerIds = await writePlayers(ladder.id, importId, input.players);
    // Reserve the table numbers (in date order, after whatever the ladder has).
    let firstNumber = 0;
    for (let attempt = 0; attempt < 5 && !firstNumber; attempt++) {
      const { data: cur } = await db().from("ladders").select("table_count").eq("id", ladder.id).single();
      const count = (cur as { table_count: number }).table_count;
      const { data: moved } = await db().from("ladders").update({ table_count: count + input.tables, updated_at: new Date().toISOString() }).eq("id", ladder.id).eq("table_count", count).select("id");
      if (moved?.length) {
        firstNumber = count + 1;
        await db().from("ladder_imports").update({ before: { ...before, tableCount: count, afterCount: count + input.tables } }).eq("id", importId);
      }
    }
    if (!firstNumber) throw new Error("couldn't reserve table numbers");
    return { ok: true, importId, playerIds, firstNumber };
  } catch (err) {
    console.error("[ladder import] players failed:", err);
    await failImport(importId);
    return { ok: false, error: "failed", message: err instanceof Error ? err.message : undefined };
  }
}

async function writePlayers(ladderId: string, importId: string, players: PlanPlayer[]): Promise<string[]> {
  const ids: string[] = new Array(players.length);
  // Players the ladder already has: keep their name, add earlier names and a country.
  const known = players.map((p, i) => ({ p, i })).filter((x) => x.p.existingId);
  for (const { p, i } of known) {
    ids[i] = p.existingId!;
    const { data } = await db().from("ladder_players").select("earlier_names, country").eq("id", p.existingId!).single();
    const cur = data as { earlier_names: string[] | null; country: string | null };
    const names = [...new Set([...(cur.earlier_names ?? []), ...p.earlierNames])].slice(0, 10);
    await db().from("ladder_players").update({ earlier_names: names, country: cur.country ?? p.country }).eq("id", p.existingId!);
  }
  const fresh = players.map((p, i) => ({ p, i })).filter((x) => !x.p.existingId);
  for (let k = 0; k < fresh.length; k += 500) {
    const chunk = fresh.slice(k, k + 500);
    const { data, error } = await db().from("ladder_players").insert(chunk.map(({ p }) => ({
      ladder_id: ladderId, name: p.name.slice(0, 32), name_key: p.key, discord_id: p.discordId, country: p.country, earlier_names: p.earlierNames, import_id: importId,
    }))).select("id, name_key");
    if (error) throw new Error(`players: ${error.message}`);
    const byKey = new Map(((data ?? []) as { id: string; name_key: string }[]).map((r) => [r.name_key, r.id]));
    for (const { p, i } of chunk) {
      const id = byKey.get(p.key);
      if (!id) throw new Error(`player ${p.name} wasn't written`);
      ids[i] = id;
    }
  }
  return ids;
}

export interface TablePiece {
  number: number; season: number; ref: string; at: string; format: number; tier: string | null; body: string; teamsKnown: boolean;
  results: { playerId: string; team: number; place: number; score: number | null; before: number; delta: number; after: number }[];
}

/** One piece of tables with their changes. */
export async function addImportTables(importId: string, ladder: Ladder, tables: TablePiece[]): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  const imp = await importRow(importId);
  if (!imp || imp.ladderId !== ladder.id || imp.status !== "writing") return { ok: false, error: "not_writing" };
  const size = ladder.kind === "knockout" ? 24 : 12;
  try {
    for (let k = 0; k < tables.length; k += 250) {
      const chunk = tables.slice(k, k + 250);
      const { data, error } = await db().from("ladder_tables").insert(chunk.map((t) => ({
        ladder_id: ladder.id, season: t.season, number: t.number, format: t.format, size, tier: t.tier?.slice(0, 12) || null, body: t.body.slice(0, 4000),
        status: "verified", submitted_by: "import", submitted_by_name: "the lounge's records", verified_by: "import", verified_by_name: null,
        note: t.teamsKnown ? null : "The lounge's records don't say who teamed with whom here, so tied teams are shown together.",
        created_at: t.at, verified_at: t.at, updated_at: new Date().toISOString(), import_id: importId, source_ref: t.ref.slice(0, 40),
      }))).select("id, number");
      if (error) throw new Error(`tables: ${error.message}`);
      const idOf = new Map(((data ?? []) as { id: string; number: number }[]).map((r) => [r.number, r.id]));
      const changes = chunk.flatMap((t) => t.results.map((r) => ({
        table_id: idOf.get(t.number), player_id: r.playerId, ladder_id: ladder.id, season: t.season, team: r.team, place: r.place,
        score: r.score, mmr_before: r.before, delta: r.delta, mmr_after: r.after,
      })));
      for (let c = 0; c < changes.length; c += 1000) {
        const { error: cErr } = await db().from("ladder_changes").insert(changes.slice(c, c + 1000));
        if (cErr) throw new Error(`changes: ${cErr.message}`);
      }
    }
    return { ok: true, written: tables.length };
  } catch (err) {
    console.error("[ladder import] tables failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}

export interface ExtrasPiece {
  adjustments: { season: number; playerId: string; at: string; before: number; delta: number; after: number; kind: "penalty" | "bonus" }[];
  ratings: { season: number; playerId: string; mmr: number; peak: number; events: number; wins: number; last: string }[];
}

/** Penalty and bonus lines, and each player's numbers per season. */
export async function addImportExtras(importId: string, ladder: Ladder, piece: ExtrasPiece): Promise<{ ok: true } | { ok: false; error: string }> {
  const imp = await importRow(importId);
  if (!imp || imp.ladderId !== ladder.id || imp.status !== "writing") return { ok: false, error: "not_writing" };
  try {
    for (let k = 0; k < piece.adjustments.length; k += 1000) {
      const { error } = await db().from("ladder_adjustments").insert(piece.adjustments.slice(k, k + 1000).map((a) => ({
        ladder_id: ladder.id, season: a.season, player_id: a.playerId, kind: a.kind, mmr_before: a.before, delta: a.delta, mmr_after: a.after,
        reason: "From the lounge's records", at: a.at, by_id: "import", import_id: importId,
      })));
      if (error) throw new Error(`adjustments: ${error.message}`);
    }
    for (let k = 0; k < piece.ratings.length; k += 1000) {
      const { error } = await db().from("ladder_ratings").upsert(piece.ratings.slice(k, k + 1000).map((r) => ({
        ladder_id: ladder.id, season: r.season, player_id: r.playerId, mmr: Math.max(1, r.mmr), peak: Math.max(1, r.peak), events: r.events, wins: r.wins, last_event_at: r.last,
      })), { onConflict: "ladder_id,season,player_id" });
      if (error) throw new Error(`ratings: ${error.message}`);
    }
    return { ok: true };
  } catch (err) {
    console.error("[ladder import] extras failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}

/**
 * Finishes an import: the seasons' dates, where the ladder picks up (carry on the newest season, or start the next,
 * pick 9A), and for the 200cc Lounge bot's files its rules and divisions.
 */
export async function finishImport(importId: string, ladder: Ladder, input: {
  seasons: { season: number; from: string; to: string }[]; carryOn: boolean; rules: "lounge200" | null; divisions: { name: string; at: number }[];
}): Promise<{ ok: true; season: number } | { ok: false; error: string }> {
  const imp = await importRow(importId);
  if (!imp || imp.ladderId !== ladder.id || imp.status !== "writing") return { ok: false, error: "not_writing" };
  const newest = Math.max(...input.seasons.map((s) => s.season));
  // The ladder never moves back a season; a season it's past has ended even when "carry on" was picked.
  const season = Math.max(ladder.season, input.carryOn ? newest : newest + 1);
  const { error: sErr } = await db().from("ladder_seasons").upsert(input.seasons.map((s) => ({
    ladder_id: ladder.id, season: s.season, started_at: s.from || null, ended_at: s.season === season ? null : s.to || null, source: "import", import_id: importId,
  })), { onConflict: "ladder_id,season" });
  if (sErr) { console.error("[ladder import] seasons failed:", sErr.message); return { ok: false, error: sErr.message }; }
  const raw: Record<string, unknown> = { ...ladder.settings };
  if (input.rules === "lounge200") { raw.rules = "lounge200"; raw.placement = LOUNGE200_PLACEMENT; }
  if (input.divisions.length) raw.divisions = input.divisions;
  const settings = cleanSettings(raw, ladder.game, ladder.kind);
  await db().from("ladders").update({ season, settings, updated_at: new Date().toISOString() }).eq("id", ladder.id);
  if (!input.carryOn) await db().from("ladder_seasons").upsert({ ladder_id: ladder.id, season, started_at: new Date().toISOString(), source: "gameshuffle" }, { onConflict: "ladder_id,season", ignoreDuplicates: true });
  await db().from("ladder_imports").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", importId);
  return { ok: true, season };
}

/** A failed import: removes what it wrote and marks it failed. */
export async function failImport(importId: string): Promise<void> {
  const imp = await importRow(importId);
  if (!imp || imp.status === "undone") return;
  await removeImport(imp);
  await db().from("ladder_imports").update({ status: "failed", undone_at: new Date().toISOString() }).eq("id", importId);
}

/** Undo (pick 12A): everything one import added, and the ladder as it was. Refused once its seasons have tables played here. */
export async function undoImport(importId: string): Promise<"ok" | "missing" | "own_tables" | "already"> {
  const imp = await importRow(importId);
  if (!imp) return "missing";
  if (imp.status === "undone" || imp.status === "failed") return "already";
  const own = (await seasonsWithOwnTables(imp.ladderId)).filter((s) => imp.seasons.includes(s));
  if (own.length) return "own_tables";
  await removeImport(imp);
  await db().from("ladder_imports").update({ status: "undone", undone_at: new Date().toISOString() }).eq("id", importId);
  return "ok";
}

async function removeImport(imp: ImportRow & { before: Before | null }): Promise<void> {
  const ladderId = imp.ladderId;
  await db().from("ladder_tables").delete().eq("import_id", imp.id);
  await db().from("ladder_adjustments").delete().eq("import_id", imp.id);
  if (imp.seasons.length) await db().from("ladder_ratings").delete().eq("ladder_id", ladderId).in("season", imp.seasons);
  await db().from("ladder_seasons").delete().eq("import_id", imp.id);
  // Players this import made who have nothing left on the ladder.
  const { data: made } = await readAllPages<{ id: string }>((from, to) => db().from("ladder_players").select("id").eq("import_id", imp.id).order("id").range(from, to), 50_000);
  const ids = made.map((r) => r.id);
  for (let k = 0; k < ids.length; k += 200) {
    const chunk = ids.slice(k, k + 200);
    const [{ data: c }, { data: r }] = await Promise.all([
      db().from("ladder_changes").select("player_id").in("player_id", chunk).limit(5000),
      db().from("ladder_ratings").select("player_id").in("player_id", chunk).limit(5000),
    ]);
    const keep = new Set([...((c ?? []) as { player_id: string }[]), ...((r ?? []) as { player_id: string }[])].map((x) => x.player_id));
    const gone = chunk.filter((id) => !keep.has(id));
    if (gone.length) await db().from("ladder_players").delete().in("id", gone);
  }
  // The ladder as it was: its season and settings, and the table count if nothing was numbered after the import.
  if (imp.before) {
    const patch: Record<string, unknown> = { season: imp.before.season, settings: imp.before.settings, updated_at: new Date().toISOString() };
    const { data: cur } = await db().from("ladders").select("table_count").eq("id", ladderId).single();
    if ((cur as { table_count: number } | null)?.table_count === imp.before.afterCount) patch.table_count = imp.before.tableCount;
    await db().from("ladders").update(patch).eq("id", ladderId);
  }
}
