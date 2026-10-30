/**
 * GET /api/mmr/font?name=<family> → { ok, name, weight } | { ok: false, error }
 * "Any Google Font" on the MMR card (feedback picks 2026-10-29, M10): checks Google Fonts has the
 * family and finds its heaviest weight we use (900 down to 400), so the card's stylesheet never asks
 * for a weight the family doesn't have. Signed in; the save itself is checked by hasLooks.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { FONT_WEIGHTS, cleanFontName, googleFamily } from "@/lib/mmr/look";

export const runtime = "nodejs";

const found = new Map<string, number | null>();

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const name = cleanFontName(req.nextUrl.searchParams.get("name"));
  if (name.length < 2) return NextResponse.json({ ok: false, error: "bad_name" }, { status: 400 });
  if (!(await rateLimit(`mmr-font:${user.id}`, { max: 20, windowMs: 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const key = name.toLowerCase();
  let weight = found.get(key);
  if (weight === undefined) {
    weight = null;
    for (const w of FONT_WEIGHTS) {
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${googleFamily(name)}:wght@${w}&display=swap`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) { weight = w; break; }
    }
    found.set(key, weight);
  }
  if (weight == null) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, name, weight });
}
