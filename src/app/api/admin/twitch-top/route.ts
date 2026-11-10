/**
 * Platform admin ▸ Overview ▸ Setup ▸ Games on Twitch (src/lib/platform/twitchTop.ts). Staff/admin only.
 *   GET  → the last 30 days of readings, averaged and matched to our catalog and spaces.
 *   POST → take today's reading now (it replaces one already taken today), then the same answer as GET. Refused for
 *          five minutes after the last reading, since each one makes about 200 Twitch requests.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { lastReadingAt, takeTwitchReading, twitchNow } from "@/lib/platform/twitchTop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GAP_MS = 5 * 60_000;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    return NextResponse.json({ ok: true, now: await twitchNow() }, { headers: noStore });
  } catch (err) {
    console.error("[admin/twitch-top] read failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST() {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const last = await lastReadingAt();
  if (last && Date.now() - Date.parse(last) < GAP_MS) {
    return NextResponse.json({ error: "too_soon", retryAt: new Date(Date.parse(last) + GAP_MS).toISOString() }, { status: 429 });
  }
  try {
    const taken = await takeTwitchReading();
    if (!taken.ok) return NextResponse.json({ error: taken.reason }, { status: 503 });
    return NextResponse.json({ ok: true, taken, now: await twitchNow() }, { headers: noStore });
  } catch (err) {
    console.error("[admin/twitch-top] reading failed:", err);
    return NextResponse.json({ error: "twitch_failed" }, { status: 502 });
  }
}
