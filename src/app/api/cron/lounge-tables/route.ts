/**
 * GET /api/cron/lounge-tables (hourly): copy new verified lounge tables (src/lib/lounge/tables.ts).
 * `?chunks=` raises the weeks read per game for a backfill. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { syncAllTables } from "@/lib/lounge/tables";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const chunks = Math.min(20, Math.max(1, Number(new URL(request.url).searchParams.get("chunks")) || 3));
  return NextResponse.json({ ok: true, results: await syncAllTables(chunks) });
}
