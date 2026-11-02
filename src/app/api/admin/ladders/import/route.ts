/**
 * POST /api/admin/ladders/import: writing a lounge's history into a ladder in pieces (history import picks
 * 2026-11-01, picks 10A and 12A). The browser reads the files and works the plan out (src/lib/ladders/importPlan.ts).
 *   { action: "start", ladderId, seasons, files, counts, tables, players } → { importId, playerIds, firstNumber }
 *   { action: "tables", ladderId, importId, tables: TablePiece[] }       (up to 400 a call)
 *   { action: "extras", ladderId, importId, adjustments, ratings }       (up to 4,000 rows a call)
 *   { action: "finish", ladderId, importId, seasons, carryOn, rules, divisions } → { season }
 *   { action: "fail", importId }   a piece failed: remove what was written
 *   { action: "undo", importId }   Undo from the ladders list
 * Staff/admin only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/shop/adminGuard";
import { getLadder } from "@/lib/ladders/store";
import { addImportExtras, addImportTables, failImport, finishImport, startImport, undoImport, type ExtrasPiece, type TablePiece } from "@/lib/ladders/importStore";
import type { PlanCounts, PlanPlayer } from "@/lib/ladders/importPlan";

export const runtime = "nodejs";
export const maxDuration = 120;

const err = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);
const seasonList = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 999) : []);

export async function POST(req: Request) {
  const supabase = await createClient();
  const gate = await requireStaff(supabase);
  if (!gate.ok) return err(gate.error, gate.status);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return err("bad_request");
  const action = body.action;

  if (action === "undo" || action === "fail") {
    if (!isId(body.importId)) return err("bad_request");
    if (action === "fail") { await failImport(body.importId); return NextResponse.json({ ok: true }); }
    const r = await undoImport(body.importId);
    return r === "ok" ? NextResponse.json({ ok: true }) : err(r, r === "missing" ? 404 : 409);
  }

  if (!isId(body.ladderId)) return err("bad_request");
  const ladder = await getLadder({ id: body.ladderId });
  if (!ladder) return err("missing", 404);

  if (action === "start") {
    const players = Array.isArray(body.players) ? (body.players as PlanPlayer[]) : [];
    const seasons = seasonList(body.seasons);
    const tables = Math.max(0, Math.round(Number(body.tables) || 0));
    if (!seasons.length || !players.length || !tables || players.length > 100_000) return err("bad_request");
    const { data: me } = await createServiceClient().from("users").select("display_name, username").eq("id", gate.userId).maybeSingle();
    const name = (me as { display_name: string | null; username: string | null } | null)?.display_name || (me as { username: string | null } | null)?.username || "Staff";
    const r = await startImport(ladder, {
      seasons, files: Array.isArray(body.files) ? body.files.map(String) : [], counts: (body.counts ?? {}) as PlanCounts, tables, players,
      by: { id: gate.userId, name },
    });
    return r.ok ? NextResponse.json(r) : err(r.error, r.error === "failed" ? 500 : 409, { seasons: r.seasons, message: r.message });
  }

  if (!isId(body.importId)) return err("bad_request");
  if (action === "tables") {
    const tables = Array.isArray(body.tables) ? (body.tables as TablePiece[]) : [];
    if (!tables.length || tables.length > 400) return err("bad_request");
    const r = await addImportTables(body.importId, ladder, tables);
    return r.ok ? NextResponse.json(r) : err(r.error, 500);
  }
  if (action === "extras") {
    const piece: ExtrasPiece = { adjustments: Array.isArray(body.adjustments) ? body.adjustments as ExtrasPiece["adjustments"] : [], ratings: Array.isArray(body.ratings) ? body.ratings as ExtrasPiece["ratings"] : [] };
    if (piece.adjustments.length + piece.ratings.length > 4000) return err("bad_request");
    const r = await addImportExtras(body.importId, ladder, piece);
    return r.ok ? NextResponse.json(r) : err(r.error, 500);
  }
  if (action === "finish") {
    const seasons = Array.isArray(body.seasons) ? (body.seasons as { season: number; from: string; to: string }[]).filter((s) => Number.isInteger(s?.season)) : [];
    if (!seasons.length) return err("bad_request");
    const divisions = Array.isArray(body.divisions) ? (body.divisions as { name: string; at: number }[]).slice(0, 30) : [];
    const r = await finishImport(body.importId, ladder, { seasons, carryOn: body.carryOn === true, rules: body.rules === "lounge200" ? "lounge200" : null, divisions });
    return r.ok ? NextResponse.json(r) : err(r.error, 500);
  }
  return err("bad_request");
}
