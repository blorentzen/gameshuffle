/**
 * GET /api/admin/game-catalog → Platform ▸ Game catalog: how many profiles
 * favorite each catalog game, and the games people added that the catalog
 * doesn't have yet ("Other"), most asked first. Staff/admin only. Reads only
 * users.favorite_games (names), never who picked what.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/shop/adminGuard";
import { catalogGame } from "@/data/game-catalog";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const svc = createServiceClient();
  const favorites = new Map<string, number>(); // catalog slug → profiles
  const asked = new Map<string, { name: string; count: number }>(); // normalized → shown name
  let profiles = 0;
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await svc.from("users").select("favorite_games").not("favorite_games", "is", null).range(from, from + 999);
    if (error) return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
    const rows = (data ?? []) as { favorite_games: string[] | null }[];
    for (const r of rows) {
      const names = r.favorite_games ?? [];
      if (names.length) profiles++;
      for (const name of new Set(names)) {
        const g = catalogGame(name);
        if (g) favorites.set(g.slug, (favorites.get(g.slug) ?? 0) + 1);
        else {
          const key = name.trim().toLowerCase();
          const a = asked.get(key) ?? { name: name.trim(), count: 0 };
          a.count++;
          asked.set(key, a);
        }
      }
    }
    if (rows.length < 1000) break;
  }
  return NextResponse.json({
    ok: true,
    profiles,
    favorites: Object.fromEntries(favorites),
    asked: [...asked.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 100),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
