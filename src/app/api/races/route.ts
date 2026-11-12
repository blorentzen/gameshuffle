/**
 * Speedrun races (picks 2026-11-10).
 *   GET  /api/races                        the signed-in runner's latest races (the speedrun page's "Your races")
 *   POST /api/races { join, max, bets }    makes a race from their setup (game, category and splits); returns its code
 *   POST /api/races { kind: "duel", trainerId, level, join, max, bets }   a duel on a Trainer Road team
 *   POST /api/races { kind: "battle", group, trainerId?, join, bets }    a trainer battle, one against one (made from a
 *                                          trainer's page, its group and that team are picked to start)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { createRace, myRaces, versusReady } from "@/lib/versus/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await versusReady())) return NextResponse.json({ ready: false, races: [] });
  return NextResponse.json({ ready: true, races: await myRaces(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  const limited = await rateLimit(`races:create:${user.id}`, { max: 10, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const res = await createRace(user.id, body);
  if (!res.ok) return NextResponse.json(res, { status: res.error === "not_ready" ? 503 : 409 });
  return NextResponse.json(res);
}
