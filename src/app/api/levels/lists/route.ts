/**
 * /api/levels/lists (curation picks 7A): lists of up to 20 levels in one game, public or private.
 *
 *   GET  ?game=  → { lists }   featured first, then public lists, plus the viewer's own
 *   POST { game, title, public } → { list }   signed in; up to 20 lists for each game
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { isLevelGame } from "@/lib/levels/games";
import { boardLists, createList } from "@/lib/levels/curation";

export const runtime = "nodejs";

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("game");
  if (!isLevelGame(game)) return NextResponse.json({ error: "bad_game" }, { status: 400 });
  return NextResponse.json({ lists: await boardLists(game, await viewer()) });
}

export async function POST(request: Request) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await rateLimit(`level-list:${userId}`, { max: 20, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLevelGame(body.game)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await createList(userId, body.game, body.title, body.public !== false);
  if (!r.ok) return NextResponse.json({ error: r.error, line: r.line }, { status: r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json({ list: r.list });
}
