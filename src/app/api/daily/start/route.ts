/**
 * POST /api/daily/start { game } → starts today's clock for this player
 * ("Start today's puzzle"): the signed-in account, else this browser's guest
 * id (x-daily-guest, hashed), so a guest who joins the boards later keeps it.
 * The first Start stands. src/lib/daily/boards.ts markStart.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { markStart } from "@/lib/daily/boards";
import { guestKey, validGuestSecret } from "@/lib/daily/guests";
import { dayKey } from "@/lib/originals/daily";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`daily-start:${ip}`, { max: 30, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { game?: unknown } | null;
  const game = body?.game === "dex" ? "dex" : "shuffle";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const secret = req.headers.get("x-daily-guest");
  const key = user ? `u:${user.id}` : validGuestSecret(secret) ? `g:${guestKey(secret)}` : null;
  if (!key) return NextResponse.json({ ok: false, error: "no_player" }, { status: 400 });
  return NextResponse.json({ ok: await markStart(key, game, dayKey()) });
}
