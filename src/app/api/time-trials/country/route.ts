/**
 * POST /api/time-trials/country { country: "us" | null } → the signed-in player's country for the country boards and
 * national records (round 3 pick 6A). A country picked here wins over one filled in from the lounge or MKCentral.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { isCountryCode, pickCountry } from "@/lib/timeTrials/countries";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-country:${actor.player}`, { max: 20, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { country?: unknown };
  const country = body.country == null || body.country === "" ? null : String(body.country).toLowerCase();
  if (country && !isCountryCode(country)) return NextResponse.json({ ok: false, error: "bad_country" }, { status: 400 });
  const ok = await pickCountry(actor.player, country);
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
