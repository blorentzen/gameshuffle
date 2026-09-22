/**
 * GET /api/cron/ticket-holds — release ticket holds whose checkout window
 * lapsed without payment, so the seats go back on sale. Stripe's
 * `checkout.session.expired` webhook usually gets there first; this is the
 * backstop for sessions that never reported. Every 10 minutes (vercel.json).
 */

import { NextResponse } from "next/server";
import { expireHeldOrders } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/ticket-holds] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const released = await expireHeldOrders();
  return NextResponse.json({ ok: true, released });
}
