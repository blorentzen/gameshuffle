/**
 * /api/instant/daily: the Daily Shuffle and Daily Dex in the Facebook Instant
 * Game (Britton's picks, 2026-10-18, https://claude.ai/artifact/VuVfmLAmw6DXapsC3s3eRZ).
 * The puzzles play in the game itself (the same day's puzzle as the site);
 * this route is only for the site's daily leaderboards, joined with a nickname
 * like a guest on the site (src/lib/daily/guests.ts). The game makes its own
 * random guest id, keeps it in Facebook's player storage and sends it as
 * `secret`; we keep only its hash. Never any Facebook data.
 *   GET  ?game=shuffle|dex&secret=           → { onBoard, name, board } (today's board, top 10 + you)
 *   POST { action: "start",  game, secret }        → the solve-time clock starts (first Start stands)
 *   POST { action: "join",   name, secret }        → on the boards with a nickname (or a new name)
 *   POST { action: "result", game, day, guesses, secret } → a finished game, re-judged here
 * The site's own join asks for a Cloudflare check, which can't run reliably
 * inside Facebook: here a network still adds at most 3 new names a day, names
 * pass the word filter, and every action is rate limited.
 */
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { instantIp, instantJson as json, instantPreflight } from "@/lib/instant/cors";
import { SHUFFLE, dayKey } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { boardView, markStart } from "@/lib/daily/boards";
import { guestFor, guestKey, joinBoards, saveGuestResult, validGuestSecret } from "@/lib/daily/guests";

export const runtime = "nodejs";

const gameOf = (g: unknown) => (g === "dex" ? DEX : SHUFFLE);

export async function OPTIONS(req: NextRequest) {
  return instantPreflight(req);
}

export async function GET(req: NextRequest) {
  const { ok } = await rateLimit(`instant-daily-view:${instantIp(req)}`, { max: 60, windowMs: 60_000 });
  if (!ok) return json(req, { error: "rate_limited" }, 429);
  const game = gameOf(req.nextUrl.searchParams.get("game"));
  const secret = req.nextUrl.searchParams.get("secret");
  const guest = validGuestSecret(secret) ? await guestFor(secret) : null;
  const board = await boardView({ game: game.id, period: "day", day: dayKey(), me: guest ? `g:${guest.key}` : null, limit: 10 }).catch(() => null);
  return json(req, { onBoard: !!guest && !guest.claimedBy, name: guest?.name ?? null, board });
}

export async function POST(req: NextRequest) {
  const ip = instantIp(req);
  const { ok } = await rateLimit(`instant-daily:${ip}`, { max: 40, windowMs: 10 * 60_000 });
  if (!ok) return json(req, { error: "rate_limited", message: "Slow down a little and try again in a few minutes." }, 429);
  const body = (await req.json().catch(() => ({}))) as { action?: string; game?: unknown; secret?: unknown; name?: unknown; day?: unknown; guesses?: unknown };
  if (!validGuestSecret(body.secret)) return json(req, { error: "bad_body" }, 400);
  const secret = body.secret;
  const game = gameOf(body.game);

  if (body.action === "start") {
    return json(req, { ok: await markStart(`g:${guestKey(secret)}`, game.id, dayKey()) });
  }
  if (body.action === "join") {
    const joined = await joinBoards(secret, body.name, ip);
    if (!joined.ok) {
      const message = joined.message ?? (joined.error === "too_many" ? "Too many new names from this network today. Try again tomorrow." : "Couldn't join just now. Try again.");
      return json(req, { error: joined.error, message }, joined.error === "failed" ? 500 : 400);
    }
    return json(req, { ok: true, name: joined.guest.name });
  }
  if (body.action === "result") {
    const saved = await saveGuestResult(secret, game, body.day, body.guesses);
    if (!saved.ok) return json(req, { error: saved.error }, saved.error === "failed" ? 500 : 400);
    return json(req, { ok: true, points: saved.score?.points ?? null });
  }
  return json(req, { error: "bad_body" }, 400);
}
