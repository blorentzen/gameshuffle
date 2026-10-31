/**
 * GET /api/cron/lounge (every 15 minutes): refresh confirmed lounge players, then post
 * rank-ups, keep division roles in step and post Monday's server boards in Discord.
 * See src/lib/lounge/sync.ts. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { runLoungeSync } from "@/lib/lounge/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const result = await runLoungeSync();
  return NextResponse.json({ ok: true, ...result });
}
