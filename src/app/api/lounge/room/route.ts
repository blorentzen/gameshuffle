import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { isMmrGame } from "@/lib/mmr/rules";
import { parseRoom } from "@/lib/lounge/room";
import { lookUpRoom, saveRoom, savedRoom } from "@/lib/lounge/roomServer";

/**
 * POST /api/lounge/room { text, game, teamSize?, me? }: read a pasted room (anyone; a signed-in
 * player's last room is kept for the overlay piece and !odds). GET: the signed-in player's last room.
 */

const TEAM_SIZES = new Set([1, 2, 3, 4, 6]);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ room: null });
  return NextResponse.json({ room: await savedRoom(user.id) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await rateLimit(`lounge-room:${user?.id ?? ip}`, { max: 8, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; game?: unknown; teamSize?: unknown; me?: unknown };
  const game = isMmrGame(body.game) ? body.game : "mkworld12p";
  const teamSize = TEAM_SIZES.has(Number(body.teamSize)) ? Number(body.teamSize) : 1;
  const teams = parseRoom(typeof body.text === "string" ? body.text.slice(0, 4000) : "", teamSize);
  if (teams.length < 2) return NextResponse.json({ error: "too_few" }, { status: 400 });
  const me = typeof body.me === "string" && body.me.trim() ? body.me.trim().slice(0, 40) : null;
  try {
    const { players, read, meName } = await lookUpRoom(teams, game, me, teamSize);
    if (user) await saveRoom(user.id, { game, teamSize, me: meName, players });
    return NextResponse.json({ game, players, read });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
