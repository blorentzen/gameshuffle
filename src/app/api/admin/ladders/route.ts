/**
 * GET /api/admin/ladders → every ladder with its numbers and imports, for Platform ▸ Community ▸ Ladders.
 * GET ?players=<ladder id> → that ladder's players (id, name, key, Discord id) and the seasons played on GameShuffle,
 * so the import screen can match players and refuse seasons it can't fill. Staff/admin only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/shop/adminGuard";
import { getLadder, laddersReady } from "@/lib/ladders/store";
import { existingPlayers, importReady, listImports, seasonsWithOwnTables } from "@/lib/ladders/importStore";
import { LADDER_GAMES, LADDER_KINDS, LADDER_RULES, cleanSettings, type LadderGame, type LadderKind } from "@/lib/ladders/types";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!(await laddersReady())) return NextResponse.json({ ok: false, error: "not_ready" }, { headers: NO_STORE });
  const url = new URL(req.url);
  const forLadder = url.searchParams.get("players");
  if (forLadder) {
    const ladder = await getLadder({ id: forLadder });
    if (!ladder) return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
    const [players, own] = await Promise.all([existingPlayers(ladder.id), seasonsWithOwnTables(ladder.id)]);
    return NextResponse.json({ ok: true, players, ownSeasons: own }, { headers: NO_STORE });
  }
  const db = createServiceClient();
  const { data } = await db.from("ladders").select("id, slug, name, game, kind, settings, season, status, table_count, created_at").neq("status", "archived").order("created_at", { ascending: false }).limit(200);
  type R = { id: string; slug: string; name: string; game: LadderGame; kind: LadderKind; settings: unknown; season: number; status: string; table_count: number; created_at: string };
  const rows = (data ?? []) as R[];
  const counts = await Promise.all(rows.map(async (r) => {
    const { count } = await db.from("ladder_players").select("id", { count: "exact", head: true }).eq("ladder_id", r.id);
    return count ?? 0;
  }));
  const ready = await importReady();
  const imports = ready && rows.length ? await listImports(rows.map((r) => r.id)) : [];
  return NextResponse.json({
    ok: true, importReady: ready,
    ladders: rows.map((r, i) => {
      const s = cleanSettings(r.settings, r.game, r.kind);
      return {
        id: r.id, slug: r.slug, name: r.name, mode: r.kind === "knockout" ? LADDER_KINDS.knockout : LADDER_GAMES[r.game], rules: LADDER_RULES[s.rules],
        season: r.season, status: r.status, tables: r.table_count, players: counts[i],
      };
    }),
    imports,
  }, { headers: NO_STORE });
}
