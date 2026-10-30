/**
 * Time trials on the site.
 *   GET  ?game=&track=&cc=&scope=everyone|friends|crew|server&guild=&proof=1 → a track's board (a server: only its own players)
 *   GET  ?game=&summary=1                                       → records per track (the hub)
 *   GET  ?me=1                                                  → the signed-in player's bests
 *   GET  ?q=                                                    → players by name (two letters or more)
 *   POST { game, track, cc, time, proofUrl?, video? }           → add a time (signed in)
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { keyFromPublicUrl } from "@/lib/storage/r2";
import { siteActor } from "@/lib/timeTrials/players";
import { addTime, boardFor, findPlayers, playerBests, serversFor, trackSummary, ttReady, type TtScope } from "@/lib/timeTrials/store";
import { parseTime, videoProof } from "@/lib/timeTrials/rules";
import { isClassFor, isTtGame, ttTrack, TT_GAMES, type TtClass } from "@/lib/timeTrials/tracks";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };
const SCOPES: TtScope[] = ["everyone", "friends", "crew", "server"];

export async function GET(req: Request) {
  const u = new URL(req.url);
  const actor = await siteActor();
  if (u.searchParams.get("me") === "1") {
    if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
    return NextResponse.json({ ok: true, ready: await ttReady(), bests: await playerBests(actor.player) }, { headers: NO_STORE });
  }
  const q = u.searchParams.get("q");
  if (q != null) {
    if (!(await rateLimit(`tt-search:${req.headers.get("x-forwarded-for") ?? "?"}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
    return NextResponse.json({ ok: true, players: await findPlayers(q) }, { headers: NO_STORE });
  }
  const game = u.searchParams.get("game");
  if (!isTtGame(game)) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
  if (u.searchParams.get("summary") === "1") {
    return NextResponse.json({ ok: true, summary: await trackSummary(game) }, { headers: NO_STORE });
  }
  const track = u.searchParams.get("track") ?? "";
  if (!ttTrack(game, track)) return NextResponse.json({ ok: false, error: "bad_track" }, { status: 400 });
  const ccRaw = Number(u.searchParams.get("cc") ?? TT_GAMES[game].classes[0]);
  const cc = (isClassFor(game, ccRaw) ? ccRaw : TT_GAMES[game].classes[0]) as TtClass;
  const scopeRaw = u.searchParams.get("scope") as TtScope;
  let scope = SCOPES.includes(scopeRaw) ? scopeRaw : "everyone";
  // A Discord server's board: only for players that server has seen.
  const guild = u.searchParams.get("guild");
  if (scope === "server" && !(actor && guild && (await serversFor(actor.player)).some((g) => g.guildId === guild))) scope = "everyone";
  const board = await boardFor({ game, track, cc, scope, viewer: actor?.player ?? null, guildId: scope === "server" ? guild : null, proofOnly: u.searchParams.get("proof") === "1" });
  return NextResponse.json({ ok: true, board }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-add:${actor.player}`, { max: 30, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { game?: unknown; track?: unknown; cc?: unknown; time?: unknown; proofUrl?: unknown; video?: unknown; read?: unknown };
  if (!isTtGame(body.game)) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
  const game = body.game;
  const track = typeof body.track === "string" ? body.track : "";
  if (!ttTrack(game, track)) return NextResponse.json({ ok: false, error: "bad_track" }, { status: 400 });
  const cc = Number(body.cc ?? TT_GAMES[game].classes[0]);
  if (!isClassFor(game, cc)) return NextResponse.json({ ok: false, error: "bad_class" }, { status: 400 });
  const timeMs = typeof body.time === "number" ? Math.round(body.time) : parseTime(String(body.time ?? ""));
  if (!timeMs || timeMs < 30_000 || timeMs > 600_000) return NextResponse.json({ ok: false, error: "bad_time" }, { status: 400 });

  // Proof: a screenshot this account uploaded through /api/time-trials/read, or a video link.
  let proof: "none" | "screenshot" | "video" = "none";
  let proofUrl: string | null = null;
  if (typeof body.proofUrl === "string" && body.proofUrl) {
    const key = keyFromPublicUrl(body.proofUrl);
    if (!key || !key.startsWith(`time-trials/${actor.userId}/`)) return NextResponse.json({ ok: false, error: "bad_proof" }, { status: 400 });
    proof = "screenshot";
    proofUrl = body.proofUrl;
  } else if (typeof body.video === "string" && body.video.trim()) {
    proofUrl = videoProof(body.video);
    if (!proofUrl) return NextResponse.json({ ok: false, error: "bad_video" }, { status: 400 });
    proof = "video";
  }

  const res = await addTime({
    player: actor.player, userId: actor.userId, identityId: null,
    game, track, cc: cc as TtClass, timeMs, proof, proofUrl, readByAi: body.read === true, source: "site",
  });
  if (!res.ok) return NextResponse.json(res, { status: res.error === "not_ready" ? 503 : 400 });
  return NextResponse.json(res, { headers: NO_STORE });
}
