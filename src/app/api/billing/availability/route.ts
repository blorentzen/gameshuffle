/**
 * GET /api/billing/availability → { paidPlans: { available, country }, paidEntry: boolean }
 * Whether this visitor can start a paid-plan checkout (US-only for now), so
 * upgrade buttons can offer the waitlist instead of a checkout that refuses.
 */
import { NextResponse } from "next/server";
import { paidPlanAvailability, paidTicketsEnabled } from "@/lib/billing/availability";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json({ paidPlans: paidPlanAvailability(request), paidEntry: await paidTicketsEnabled() }, { headers: { "Cache-Control": "private, no-store" } });
}
