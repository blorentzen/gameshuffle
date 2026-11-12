/**
 * GET / POST /api/levels (levels picks 2026-11-11; free)
 *
 * The board in each game's space.
 *   GET  ?game=<board game> &sort=top|streamers|newest|hardest|lists (before the curation tables: newest|played|hard)
 *        &offset= &extras=1 → { levels, more, lists?, extras? }
 *   POST { game, code, title, tags[], edition?, version?, note?, spots? } → { level }   (signed in; the code is
 *        checked, the words pass the word filter; 10 an hour). Followers hear about it after the response.
 */

import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { CURATION_GAMES, isLevelGame } from "@/lib/levels/games";
import { listLevels, shareLevel } from "@/lib/levels/store";
import { boardExtras, boardLevels, boardLists, notifyFollowers } from "@/lib/levels/curation";
import { curationReady } from "@/lib/levels/ready";
import { isBoardSort, type BoardSort } from "@/lib/levels/rules";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const game = q.get("game");
  if (!isLevelGame(game)) return NextResponse.json({ error: "bad_game" }, { status: 400 });
  const sortRaw = q.get("sort");
  const sort: BoardSort = isBoardSort(sortRaw) ? sortRaw : "newest";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;
  const offset = Number(q.get("offset")) || 0;
  if (await curationReady()) {
    const [out, lists, extras] = await Promise.all([
      boardLevels({ game, sort, viewerId, offset }),
      sort === "lists" ? boardLists(game, viewerId) : Promise.resolve(undefined),
      q.get("extras") ? boardExtras(game, viewerId) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ ...(out ?? { levels: [], more: false }), ...(lists ? { lists } : {}), ...(extras ? { extras } : {}) });
  }
  if (CURATION_GAMES.includes(game)) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const out = await listLevels({ game, sort, viewerId, offset });
  if (!out) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  return NextResponse.json(out);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await rateLimit(`level-share:${user.id}`, { max: 10, windowMs: 60 * 60_000 })).ok) {
    return NextResponse.json({ error: "slow_down", line: "That's a lot of levels for one hour. Try again a little later." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await shareLevel(user.id, {
    game: body.game, code: body.code, title: body.title, tags: body.tags,
    edition: body.edition, version: body.version, note: body.note, spots: body.spots,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, line: r.line }, { status: r.error === "not_ready" ? 503 : r.error === "already" ? 409 : 400 });
  const level = r.level;
  after(() => notifyFollowers(user.id, { id: level.id, game: level.game, title: level.title }).catch((err) => console.error("[levels] follower notices failed:", err)));
  return NextResponse.json({ level });
}
