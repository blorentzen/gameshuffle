import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNight, PartyError } from "@/lib/party/nights";
import { quickGameSlug } from "@/lib/home/nextPicks";
import { describePlayers } from "@/lib/daily/boards";
import { nightGame } from "@/lib/nights/games";
import { rateLimit } from "@/lib/ratelimit";

/**
 * POST { game: "mario-party" | "mario-kart" }: a night with friends in one tap (dailies picks 2026-11-05, 6A). Makes a
 * secret night with your seat and three open ones (friends take a seat with the code), in the Mario Party or Mario Kart
 * you play, and answers with the code, the link and your friends (you follow each other) to save a seat for.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { ok } = await rateLimit(`party-quick:${user.id}`, { max: 6, windowMs: 60 * 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { game?: unknown };
  const game = body.game === "mario-kart" ? "mario-kart" : body.game === "mario-party" ? "mario-party" : null;
  if (!game) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const db = createServiceClient();
  const { data: me } = await db.from("users").select("display_name, username, favorite_games").eq("id", user.id).maybeSingle();
  const row = me as { display_name: string | null; username: string | null; favorite_games: string[] | null } | null;
  const slug = quickGameSlug(game, row?.favorite_games ?? []);
  const name = (row?.display_name || row?.username || "Host").slice(0, 24);
  try {
    const night = await createNight({
      hostId: user.id, gameSlug: slug, config: {}, visibility: "secret", hostSeat: 0, lineup: [],
      seats: [{ name, isCpu: false, character: null }, ...[2, 3, 4].map((n) => ({ name: `Player ${n}`, isCpu: false, character: null }))],
    });
    // Friends (you follow each other) to save a seat for.
    const [{ data: out }, { data: back }] = await Promise.all([
      db.from("follows").select("followee_user_id").eq("follower_user_id", user.id).limit(200),
      db.from("follows").select("follower_user_id").eq("followee_user_id", user.id).limit(500),
    ]);
    const backs = new Set(((back ?? []) as { follower_user_id: string }[]).map((r) => r.follower_user_id));
    const ids = ((out ?? []) as { followee_user_id: string }[]).map((r) => r.followee_user_id).filter((id) => backs.has(id)).slice(0, 12);
    const names = ids.length ? await describePlayers(ids.map((id) => `u:${id}`)) : new Map();
    const friends = ids.map((id) => ({ id, ...names.get(`u:${id}`) })).filter((f) => f.profile).map((f) => ({ id: f.id, name: f.name as string, avatar: (f.avatar ?? null) as string | null }));
    return NextResponse.json({ ok: true, code: night.code, path: `/party/${night.code}`, game: nightGame(slug)?.label ?? "Game", friends });
  } catch (e) {
    const err = e instanceof PartyError ? e : new PartyError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
