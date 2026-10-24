/**
 * GET /api/cron/road-duels
 *
 * Trainer Road's duels for the month (src/lib/originals/duel/roadStore.ts ensureRoadDuels): the
 * month's missing duels, a few per run (Kanto first), then the month's duels stored on older rules
 * that nobody has started (built again on the newest), and in the month's last three days next
 * month's, so the 1st never waits. Every 10 minutes. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { ensureRoadDuels } from "@/lib/originals/duel/roadStore";
import { ROAD_PUBLIC } from "@/lib/games-visibility";

export const runtime = "nodejs";
/** ensureRoadDuels searches for up to 240 seconds. */
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/road-duels] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!ROAD_PUBLIC) return NextResponse.json({ ok: true, built: 0, left: 0 });
  const t0 = Date.now();
  const got = await ensureRoadDuels(240_000).catch((err) => {
    console.error("[cron/road-duels] failed:", err);
    return { built: 0, left: 0 };
  });
  if (got.built || got.left) console.log("[cron/road-duels]", { ...got, durationMs: Date.now() - t0 });
  return NextResponse.json({ ok: true, ...got });
}
