/**
 * GET /api/account/board-roster → { ok, players: {id,name}[] }  (saved roster)
 * PUT /api/account/board-roster { players } → { ok, players }    (replace it)
 *
 * Auth-gated. The shared board-game-night roster lives on-device by default;
 * signed-in members can save it here so it travels across devices. Degrades: if
 * the `board_game_roster` column isn't applied yet, GET returns [] and PUT
 * returns `migration_pending`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_PLAYERS = 64;
const MAX_NAME = 60;

function clean(input: unknown): { id: string; name: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { id: string; name: string }[] = [];
  const seenIds = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id.slice(0, 64) : "";
    const name = typeof (raw as { name?: unknown }).name === "string" ? (raw as { name: string }).name.trim().slice(0, MAX_NAME) : "";
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    out.push({ id, name });
    if (out.length >= MAX_PLAYERS) break;
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("users")
    .select("board_game_roster")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: true, players: [] });
  return NextResponse.json({ ok: true, players: clean(data?.board_game_roster) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { players?: unknown };
  const players = clean(body.players);

  const { error } = await supabase.from("users").update({ board_game_roster: players }).eq("id", user.id);
  if (error) {
    const missing = /column|board_game_roster|schema cache/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? "migration_pending" : error.message }, { status: missing ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, players });
}
