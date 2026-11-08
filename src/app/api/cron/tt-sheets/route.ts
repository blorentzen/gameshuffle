/**
 * GET /api/cron/tt-sheets (daily, 11:30 UTC): reads the community's Mario Kart 8 Deluxe Top 10 sheets and saves what
 * changed (src/lib/timeTrials/sheetSync.ts; picks 2026-11-04, SGSXW3sBrn6GJSinYimSnc), then fills in countries for
 * players who have times and none yet (their account's, a confirmed lounge name's, MKCentral's), and sends the one
 * reminder for asks for an update nobody answered in a week (src/lib/timeTrials/asks.ts). `?only=base,bcp`
 * reads some sheets. Does nothing before time-trials-m5.sql. Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { syncSheets } from "@/lib/timeTrials/sheetSync";
import { fillMissingCountries } from "@/lib/timeTrials/countries";
import { remindAsks } from "@/lib/timeTrials/asks";
import type { SheetId } from "@/lib/timeTrials/sheets";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/tt-sheets] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const only = new URL(request.url).searchParams.get("only")?.split(",").filter((s): s is SheetId => s === "base" || s === "bcp" || s === "inward");
  const sheets = await syncSheets({ only: only?.length ? only : undefined });
  for (const r of sheets.reads) if (r.error) console.error(`[cron/tt-sheets] ${r.sheet} ${r.cc}cc: ${r.error}`);
  const countries = await fillMissingCountries();
  const reminded = await remindAsks().catch((e) => { console.error("[cron/tt-sheets] ask reminders failed:", e); return 0; });
  return NextResponse.json({ ...sheets, filled: countries, reminded });
}
