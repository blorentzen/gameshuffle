/**
 * Trainer Road (src/lib/originals/duel/roadStore.ts): one team's duel for its trainer page. The
 * player is the signed-in account, else the browser's guest id in x-daily-guest.
 *   GET ?team=<trainer id>                         → RoadTeamHome; a duel not built yet says ready: false and is built after answering
 *   GET ?stars=1                                   → { stars }: the player's best stars this month per team (accounts; {} for guests)
 *   POST { action: "start", team, level? }          → { run } (409 hard_off, 503 not_ready)
 */

import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { roadShown } from "@/lib/games-visibility";
import { firePlayer, ipOf } from "@/lib/fireRound/player";
import { getRoadDuel, roadStarsFor, roadTeamHome, startRoadRun } from "@/lib/originals/duel/roadStore";

export const runtime = "nodejs";
/** A duel built on request searches for up to 50 seconds. */
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const validTeam = (s: string | null | undefined): s is string => !!s && /^[a-z0-9-]{1,80}$/.test(s);

export async function GET(req: Request) {
  if (!roadShown()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const params = new URL(req.url).searchParams;
  if (params.get("stars")) return NextResponse.json({ stars: await roadStarsFor(await firePlayer(req)) }, { headers: noStore });
  const team = params.get("team");
  if (!validTeam(team)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const player = await firePlayer(req);
  const home = await roadTeamHome(player, team);
  if (!home) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Not built yet: build it after answering (the page checks back).
  if (!home.ready) after(() => getRoadDuel(team, home.month, { build: true, budgetMs: 50_000 }).then(() => undefined, () => undefined));
  return NextResponse.json(home, { headers: noStore });
}

export async function POST(req: Request) {
  if (!roadShown()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const player = await firePlayer(req);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 400 });
  const { ok: under } = await rateLimit(`road-start:${ipOf(req)}`, { max: 60, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; team?: string; level?: string };
  if (body.action !== "start" || !validTeam(body.team)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await startRoadRun(player, body.team, body.level === "hard" ? "hard" : "normal");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_ready" ? 503 : r.error === "hard_off" ? 409 : r.error === "not_found" ? 404 : 500 });
  return NextResponse.json({ run: r.run }, { headers: noStore });
}
