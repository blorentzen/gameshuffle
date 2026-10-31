/**
 * The Daily Shuffle (and with ?game=dex the Daily Dex) inside the Discord Activity (Bearer session, see
 * src/lib/activity/session.ts). Same answers as /api/daily, keyed to the
 * player's Discord identity, so no GameShuffle account is needed.
 *   GET  → { signedIn: true, stats, today, progress } (progress = today's guesses so far)
 *   PUT  { day, guesses } → saves the guesses so far
 *   POST { day, guesses } → the same, and records the result once the game is over
 * Played from a server channel (Discord-confirmed in the session), each save
 * also refreshes that channel's results card, after the response.
 */

import { NextResponse, after } from "next/server";
import { updateDailyCard } from "@/lib/activity/channelCard";
import { sessionFrom } from "@/lib/activity/session";
import { dailyView, saveIdentityGame } from "@/lib/daily/results";
import { playerForIdentity, timesFor } from "@/lib/daily/boards";
import { SHUFFLE, dayKey } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
/** `?game=dex` for the Daily Dex, else the Daily Shuffle. */
const gameOf = (req: Request) => (new URL(req.url).searchParams.get("game") === "dex" ? DEX : SHUFFLE);
/** Today's solve time and the best, under the same player the boards use. */
async function timesOf(iid: string, uid: string | null | undefined, game: typeof SHUFFLE) {
  const p = await playerForIdentity(iid, uid).catch(() => ({ kind: "i" as const, id: iid }));
  return timesFor(`${p.kind}:${p.id}`, game.id, dayKey()).catch(() => null);
}

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const game = gameOf(req);
    const [view, times] = await Promise.all([dailyView({ identityId: s.iid, userId: s.uid }, game), timesOf(s.iid, s.uid, game)]);
    return NextResponse.json({ signedIn: true, ...view, times }, { headers: NO_STORE });
  } catch (err) {
    console.error("[activity/daily] read failed:", err);
    return NextResponse.json({ signedIn: true, stats: null, today: null, progress: null }, { headers: NO_STORE });
  }
}

async function save(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { day?: unknown; guesses?: unknown } | null;
  const where = s.cid && s.gid ? { channelId: s.cid, guildId: s.gid } : null;
  const game = gameOf(req);
  const saved = await saveIdentityGame({ identityId: s.iid, userId: s.uid }, body?.day, body?.guesses, where, game);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.error === "save_failed" ? 500 : 400 });
  if (where && saved.day) {
    const day = saved.day;
    after(() => updateDailyCard({ ...where, day, game }).catch((err) => console.warn("[activity/daily] card update failed:", err)));
  }
  const [view, times] = await Promise.all([dailyView({ identityId: s.iid, userId: s.uid }, game), timesOf(s.iid, s.uid, game)]);
  return NextResponse.json({ ok: true, ...view, score: saved.score ?? null, times }, { headers: NO_STORE });
}

export const PUT = save;
export const POST = save;
