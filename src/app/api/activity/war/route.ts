/**
 * The War room (GameShuffle Competitive's Activity): src/lib/wars/room.ts.
 *   GET  ?war=<id>          → RoomState (the war this launch shows, a list to pick from, or the start form)
 *   GET  ?tracks=<game>     → every course for the track picker
 *   GET  ?teams=<q>&game=   → teams for the start form
 *   POST { action, … }      → does it, redraws the war card in the channel, returns the new RoomState
 * Signed in with the Activity's own session (Bearer), made in GameShuffle Competitive (`app: "comp"`).
 */

import { NextResponse, after } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { rateLimit } from "@/lib/ratelimit";
import { warsReady, endWar } from "@/lib/wars/store";
import { postCard, editCard } from "@/lib/wars/discord";
import { roomAction, roomState, roomTeams, roomTracks, type RoomAction } from "@/lib/wars/room";
import { isWarGame } from "@/lib/wars/rules";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const isGame = isWarGame;

function viewer(req: Request) {
  const s = sessionFrom(req);
  return s && s.app === "comp" ? s : null;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const tracks = params.get("tracks");
  if (isGame(tracks)) return NextResponse.json({ tracks: roomTracks(tracks) }, { headers: { "Cache-Control": "public, max-age=3600" } });
  const s = viewer(req);
  if (!s) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await warsReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const q = params.get("teams");
  if (q !== null) {
    if (!s.gid) return NextResponse.json({ teams: [] });
    const game = params.get("game");
    return NextResponse.json({ teams: await roomTeams(s.gid, q.slice(0, 40), isGame(game) ? game : "mkworld") }, { headers: NO_STORE });
  }
  const hint = params.get("war");
  return NextResponse.json(await roomState(s, hint && /^[0-9a-f-]{36}$/.test(hint) ? hint : null), { headers: NO_STORE });
}

export async function POST(req: Request) {
  const s = viewer(req);
  if (!s) return NextResponse.json({ error: "signin" }, { status: 401 });
  const rl = await rateLimit(`war-room:${s.did}`, { max: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "slow_down", message: "Slow down a moment." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as RoomAction | null;
  if (!body || typeof body !== "object" || typeof (body as { action?: unknown }).action !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await roomAction(s, body);
  if (!res.ok) return NextResponse.json({ error: res.error, message: res.message }, { status: 409, headers: NO_STORE });

  // A war started here needs its card in the channel before it counts, like /war.
  if (body.action === "start" && res.card) {
    const posted = await postCard(res.war.id);
    if (posted !== "ok") {
      await endWar(res.war.id);
      const message = posted === "no_access"
        ? "GameShuffle Competitive can't post in that channel. Give it Send Messages and Attach Files there, then try again."
        : "The war card couldn't be posted. Try again in a moment.";
      return NextResponse.json({ error: posted, message }, { status: 409, headers: NO_STORE });
    }
  } else if (res.card) {
    const work = res.card;
    after(async () => { await (work.move ? postCard(work.war) : editCard(work.war)); });
  }
  return NextResponse.json({ ...(await roomState(s, res.war.id)), note: res.note ?? null }, { headers: NO_STORE });
}
