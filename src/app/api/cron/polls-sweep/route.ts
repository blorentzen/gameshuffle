/**
 * GET /api/cron/polls-sweep
 *
 * Closes any open poll whose `closes_at` has passed (the streamer's optional
 * auto-close timer), plus the other every-minute sweeps and the Daily Duel's next two days.
 * Runs every minute. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { sweepDuePolls } from "@/lib/polls/store";
import { sweepStreamWindows } from "@/lib/chatbrain/stream";
import { sweepBreaks } from "@/lib/break/store";
import { sweepFireRuns } from "@/lib/fireRound/store";
import { ensureDays } from "@/lib/originals/duel/store";
import { DUEL_PUBLIC } from "@/lib/games-visibility";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/polls-sweep] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const closed = await sweepDuePolls();
  // Chat Brain windows whose time ran out with no chat activity to close them.
  const brainWindows = await sweepStreamWindows().catch((err) => {
    console.error("[cron/polls-sweep] chat brain sweep failed:", err);
    return 0;
  });
  // Break mode: moves any break whose overlay isn't open (the overlay's read normally does it).
  const breaks = await sweepBreaks().catch((err) => {
    console.error("[cron/polls-sweep] break sweep failed:", err);
    return 0;
  });
  // Fire Round: rounds whose clock ran out after the player left (today's round still goes on the board).
  const fireRuns = await sweepFireRuns().catch((err) => {
    console.error("[cron/polls-sweep] fire round sweep failed:", err);
    return 0;
  });
  // Daily Duel: today's and tomorrow's duels built ahead, so midnight and the homepage card never wait on a player.
  const duelDays = DUEL_PUBLIC
    ? await ensureDays().catch((err) => {
        console.error("[cron/polls-sweep] duel days failed:", err);
        return 0;
      })
    : 0;
  return NextResponse.json({ ok: true, closed, brainWindows, breaks, fireRuns, duelDays });
}
