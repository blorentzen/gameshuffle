/**
 * The account's one country (time trials round 4, picks 2026-11-04, 2A; time-trials-m5.sql `users.country`).
 *   GET                       → { ready, country }  (ready: false before the migration; the profile hides the field)
 *   POST { country: "us" | null } → sets or clears it, and the account's time trials country with it
 * Set from the profile's place search or its Country choice; time trials and /tt country write the same thing.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { accountCountry, accountCountryReady, isCountryCode, setAccountCountry } from "@/lib/timeTrials/countries";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const ready = await accountCountryReady();
  return NextResponse.json({ ok: true, ready, country: ready ? await accountCountry(user.id) : null }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`acct-country:${user.id}`, { max: 30, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { country?: unknown };
  const country = body.country == null || body.country === "" ? null : String(body.country).toLowerCase();
  if (country && !isCountryCode(country)) return NextResponse.json({ ok: false, error: "bad_country" }, { status: 400 });
  if (!(await accountCountryReady())) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
  const ok = await setAccountCountry(user.id, country);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
