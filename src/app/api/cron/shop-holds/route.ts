/**
 * GET /api/cron/shop-holds: close shop stock holds past their expiry. They
 * already stop counting at expires_at and checkout.session.expired releases
 * most of them; this tidies the rest. Every 10 minutes (vercel.json).
 */

import { NextResponse } from "next/server";
import { sweepShopHolds } from "@/lib/store/orders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/shop-holds] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, released: await sweepShopHolds() });
}
