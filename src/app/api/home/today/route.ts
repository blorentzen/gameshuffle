import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLive } from "@/lib/home/dailyPulse";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Today's dailies on the room, for its own refresh (dailies picks 2026-11-05, 7A): how many have played each daily,
 * the fastest, your place, your people's results and who's waiting. The room asks with the band, every 3 minutes
 * while it's on screen. Signed in only (private).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { ok } = await rateLimit(`home-today:${user.id}`, { max: 12, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const live = await todayLive(user.id).catch(() => null);
  if (!live) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json(live, { headers: { "Cache-Control": "private, no-store" } });
}
