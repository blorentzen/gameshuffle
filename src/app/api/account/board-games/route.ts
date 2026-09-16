/**
 * GET /api/account/board-games  → { ok, games: string[] }   (the member's saved collection)
 * PUT /api/account/board-games  { games: string[] } → { ok, games }  (replace it)
 *
 * Auth-gated (a free account is the conversion hook). Degrades gracefully: if the
 * `board_game_collection` column isn't applied yet, GET returns [] and PUT
 * returns `migration_pending` — the tools then just stay on device-only storage.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_GAMES = 200;
const MAX_NAME = 80;

function clean(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().slice(0, MAX_NAME);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_GAMES) break;
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("users")
    .select("board_game_collection")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: true, games: [] }); // column not migrated → empty
  return NextResponse.json({ ok: true, games: (data?.board_game_collection as string[] | null) ?? [] });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { games?: unknown };
  const games = clean(body.games);

  const { error } = await supabase.from("users").update({ board_game_collection: games }).eq("id", user.id);
  if (error) {
    const missing = /column|board_game_collection|schema cache/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? "migration_pending" : error.message }, { status: missing ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, games });
}
