/**
 * Trainer Road (src/lib/originals/duel/roadStore.ts): one team's duel for its trainer page. The
 * player is the signed-in account, else the browser's guest id in x-daily-guest.
 *   GET ?team=<trainer id>                         → RoadTeamHome; a duel not built yet says ready: false and is built after answering
 *   GET ?stars=1                                   → { stars }: the player's best stars this month per team (accounts; {} for guests)
 *   GET ?path=<region|current>                     → { progress, path }: the account's trainer card and path (null for guests) and that region's path;
 *                                                    a region's story battle due on the account's road turns up first
 *   POST { action: "start", team, level? }          → { run } (level easy | normal | hard; 409 hard_off / easy_off, 503 not_ready)
 *   GET ?mart=<region>                             → MartView: the region's Mart for an account (its shelf by badges, the bag, the balance, the tool to keep)
 *   POST { action: "buy", region, tool, nonce }     → MartView (402 insufficient_balance; 409 full / shelf; 401 for guests)
 *   POST { action: "keep", region, tool }           → MartView (a cleared region's tool kept for good; 409 not_cleared / kept)
 */

import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { roadShown } from "@/lib/games-visibility";
import { firePlayer, ipOf } from "@/lib/fireRound/player";
import { getRoadDuel, roadStarsFor, roadTeamHome, startRoadRun, withBag } from "@/lib/originals/duel/roadStore";
import { buyTool, keepTool, martView } from "@/lib/originals/duel/roadTools";
import { isToolId } from "@/lib/originals/duel/tools";
import { ensureSetEncounter, pathRegions, pathView, readProgress, roadLevers, roadProgressView } from "@/lib/originals/duel/roadProgress";
import { nextStep } from "@/lib/originals/duel/roadPath";

export const runtime = "nodejs";
/** A missing duel is built after the answer with the cron job's own budget (240 seconds): a Champion's six can take minutes (raised from 50 at launch, 2026-10-23). */
export const maxDuration = 300;

const noStore = { "Cache-Control": "private, no-store" };
const validTeam = (s: string | null | undefined): s is string => !!s && /^[a-z0-9-]{1,80}$/.test(s);

export async function GET(req: Request) {
  if (!roadShown()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const params = new URL(req.url).searchParams;
  if (params.get("stars")) return NextResponse.json({ stars: await roadStarsFor(await firePlayer(req)) }, { headers: noStore });
  const martParam = params.get("mart");
  if (martParam) {
    if (!pathRegions().includes(martParam)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const player = await firePlayer(req);
    if (player?.kind !== "u") return NextResponse.json({ error: "sign_in" }, { status: 401 });
    const mart = await martView(player.id, martParam, await readProgress(player.id), await roadLevers());
    return mart ? NextResponse.json(mart, { headers: noStore }) : NextResponse.json({ error: "not_ready" }, { status: 503 });
  }
  const pathParam = params.get("path");
  if (pathParam) {
    if (pathParam !== "current" && !pathRegions().includes(pathParam)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const player = await firePlayer(req);
    const account = player?.kind === "u" ? player.id : null;
    // A region's story battle due on this account's road turns up when they look at it (their own road only).
    if (account) await ensureSetEncounter(account, await readProgress(account));
    const [progress, raw] = account ? await Promise.all([roadProgressView(account, { always: true }), readProgress(account)]) : [null, null];
    // "current": the region the player's path is in now (Kanto for a new player; Paldea once everything is cleared).
    const region = pathParam === "current" ? nextStep(raw)?.region ?? (raw?.champion ? "paldea" : "kanto") : pathParam;
    return NextResponse.json({ progress, path: pathView(region, raw) }, { headers: noStore });
  }
  const team = params.get("team");
  if (!validTeam(team)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const player = await firePlayer(req);
  const home = await roadTeamHome(player, team);
  if (!home) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (home.current) home.current = await withBag(home.current, player);
  // Not built yet: build it after answering (the page checks back).
  if (!home.ready) after(() => getRoadDuel(team, home.month, { build: true, budgetMs: 240_000 }).then(() => undefined, () => undefined));
  return NextResponse.json(home, { headers: noStore });
}

export async function POST(req: Request) {
  if (!roadShown()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const player = await firePlayer(req);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 400 });
  const { ok: under } = await rateLimit(`road-start:${ipOf(req)}`, { max: 60, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; team?: string; level?: string; region?: string; tool?: string; nonce?: string };
  if (body.action === "buy" || body.action === "keep") {
    if (player.kind !== "u") return NextResponse.json({ error: "sign_in" }, { status: 401 });
    if (!body.region || !pathRegions().includes(body.region) || !isToolId(body.tool)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const progress = await readProgress(player.id);
    const levers = await roadLevers();
    if (body.action === "buy") {
      const nonce = typeof body.nonce === "string" && /^[A-Za-z0-9-]{6,64}$/.test(body.nonce) ? body.nonce : null;
      if (!nonce) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const r = await buyTool(player.id, body.region, body.tool, nonce, progress, levers);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "insufficient_balance" ? 402 : r.error === "full" || r.error === "shelf" ? 409 : r.error === "not_ready" ? 503 : 500 });
      return NextResponse.json(r.mart, { headers: noStore });
    }
    const r = await keepTool(player.id, body.region, body.tool, progress, levers);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_cleared" || r.error === "kept" ? 409 : r.error === "not_ready" ? 503 : 500 });
    return NextResponse.json(r.mart, { headers: noStore });
  }
  if (body.action !== "start" || !validTeam(body.team)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await startRoadRun(player, body.team, body.level === "hard" || body.level === "easy" ? body.level : "normal");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_ready" ? 503 : r.error === "hard_off" || r.error === "easy_off" ? 409 : r.error === "not_found" ? 404 : 500 });
  return NextResponse.json({ run: await withBag(r.run, player) }, { headers: noStore });
}
