import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { personaPreview } from "@/lib/preview/server";
import { accountInterests } from "@/lib/interests/store";
import { bandFor, bandForUser } from "@/lib/home/happening";
import { rateLimit } from "@/lib/ratelimit";

/**
 * The "What's happening" band, for its own refresh (room picks 2026-11-05, Britton: "feel alive, but not overwhelming"):
 * the signed-in home asks every few minutes while it's on screen, and new things in the viewer's worlds slide in.
 * Signed in: the account's band (private). Signed out: everyone's (cached a minute at the edge).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const worlds = await bandFor(null).catch(() => []);
    return NextResponse.json({ worlds }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  }
  // The home asks every few minutes; a dozen a minute is plenty for a few open tabs.
  const { ok } = await rateLimit(`home-band:${user.id}`, { max: 12, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const preview = await personaPreview();
  const interests = await accountInterests(user.id).catch(() => []);
  const worlds = await bandForUser(user.id, { sample: !!preview?.sample, interests }).catch(() => []);
  return NextResponse.json({ worlds }, { headers: { "Cache-Control": "private, no-store" } });
}
