/**
 * POST /api/referrals/finish { code, game, day, guesses, fresh } → a new
 * player finished a daily from someone's link. Signed in, the player is the
 * account; signed out, this browser (the x-daily-guest id, hashed). The game is
 * re-judged and every fair-play rule applies (src/lib/referrals/store.ts).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { SHUFFLE } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { guestKey, validGuestSecret } from "@/lib/daily/guests";
import { recordFinish } from "@/lib/referrals/store";
import type { ReferralGame } from "@/lib/referrals/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`referral-finish:${ip}`, { max: 20, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { code?: unknown; game?: unknown; day?: unknown; guesses?: unknown; fresh?: unknown } | null;
  const game: ReferralGame | null = body?.game === "dex" ? "dex" : body?.game === "weekly" ? "weekly" : body?.game === "shuffle" ? "shuffle" : null;
  if (!game) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const secret = req.headers.get("x-daily-guest");
  const player = user ? { kind: "u" as const, id: user.id } : validGuestSecret(secret) ? { kind: "g" as const, id: guestKey(secret) } : null;
  if (!player) return NextResponse.json({ ok: false, error: "no_player" }, { status: 400 });

  const result = await recordFinish({
    code: body?.code, player, game, schedule: game === "dex" ? DEX : game === "shuffle" ? SHUFFLE : undefined,
    day: body?.day, guesses: body?.guesses, fresh: body?.fresh === true, ip,
  }).catch((e) => { console.error("[referrals/finish]", e); return { ok: false as const, error: "not_ready" as const }; });
  return NextResponse.json(result);
}
