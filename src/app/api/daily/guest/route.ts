/**
 * Guests on the Daily leaderboards (src/lib/daily/guests.ts). The browser's
 * random id comes in the x-daily-guest header; the server keeps only its hash.
 *   GET                         → { onBoard, name, tokens, expires } for this browser's guest
 *   POST { action: "join", name, turnstileToken }        → on the boards with a name (a bot check
 *        the first time; renaming later needs none)
 *   POST { action: "result", game, day, guesses }        → a finished game, re-judged on the server
 *   POST { action: "claim" } (signed in)                 → the guest's tokens, scores and results
 *        move onto the account
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { rateLimit } from "@/lib/ratelimit";
import { SHUFFLE } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { claimGuest, guestFor, heldTokens, joinBoards, saveGuestResult, validGuestSecret } from "@/lib/daily/guests";

export const runtime = "nodejs";

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export async function GET(req: Request) {
  const secret = req.headers.get("x-daily-guest");
  if (!validGuestSecret(secret)) return NextResponse.json({ onBoard: false });
  const guest = await guestFor(secret);
  if (!guest) return NextResponse.json({ onBoard: false });
  const held = await heldTokens(guest.key);
  return NextResponse.json({ onBoard: true, name: guest.name, claimed: !!guest.claimedBy, ...held }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-daily-guest");
  if (!validGuestSecret(secret)) return NextResponse.json({ error: "no_guest_id" }, { status: 400 });
  const ip = ipOf(req);
  const { ok: under } = await rateLimit(`daily-guest:${ip}`, { max: 30, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; name?: unknown; turnstileToken?: string; game?: string; day?: unknown; guesses?: unknown };

  if (body.action === "join") {
    const existing = await guestFor(secret);
    if (!existing && !(await verifyTurnstileToken(body.turnstileToken, ip))) return NextResponse.json({ error: "captcha" }, { status: 400 });
    const joined = await joinBoards(secret, body.name, ip);
    if (!joined.ok) return NextResponse.json({ error: joined.error, message: joined.message }, { status: joined.error === "failed" ? 500 : 400 });
    return NextResponse.json({ ok: true, name: joined.guest.name });
  }

  if (body.action === "result") {
    const saved = await saveGuestResult(secret, body.game === "dex" ? DEX : SHUFFLE, body.day, body.guesses);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.error === "failed" ? 500 : 400 });
    const guest = await guestFor(secret);
    return NextResponse.json({ ok: true, score: saved.score, ...(guest ? await heldTokens(guest.key) : {}) });
  }

  if (body.action === "claim") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const claimed = await claimGuest(secret, user.id);
    if (!claimed.ok) return NextResponse.json({ error: claimed.error }, { status: claimed.error === "failed" ? 500 : 400 });
    return NextResponse.json(claimed);
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
