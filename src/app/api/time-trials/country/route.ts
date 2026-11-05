/**
 * The signed-in player's country for the country boards and national records (round 3 pick 6A; round 4: an account's
 * pick is its one country, `users.country`).
 *   GET                              → { country, suggest }  (suggest: the country they're connecting from, for the add form)
 *   POST { country: "us" | null }    → set or clear it
 *   POST { notNow: true }            → the time trials home stops asking (asked once, round 4 pick 1A)
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { countryOf, isCountryCode, noteAsked, pickCountry } from "@/lib/timeTrials/countries";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const have = await countryOf(actor.player);
  const ip = req.headers.get("x-vercel-ip-country")?.toLowerCase() ?? null;
  return NextResponse.json({ ok: true, country: have?.country ?? null, suggest: ip && isCountryCode(ip) ? ip : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-country:${actor.player}`, { max: 20, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { country?: unknown; notNow?: unknown };
  if (body.notNow === true) { await noteAsked(actor.player, "site"); return NextResponse.json({ ok: true }); }
  const country = body.country == null || body.country === "" ? null : String(body.country).toLowerCase();
  if (country && !isCountryCode(country)) return NextResponse.json({ ok: false, error: "bad_country" }, { status: 400 });
  const ok = await pickCountry(actor.player, country);
  if (ok && country) await noteAsked(actor.player, "site");
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
