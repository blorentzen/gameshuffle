/**
 * GET /api/cron/shop-tracking: order tracking (shop picks 2026-11-08). Boxes still on their way are read back from
 * Printful (delivered, came back, the carrier's steps), and paid orders past the day they were due to ship get one
 * "running late" email. Every 3 hours (vercel.json).
 */

import { NextResponse } from "next/server";
import { runShopTracking } from "@/lib/store/tracking";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/shop-tracking] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(await runShopTracking()) });
}
