/**
 * GET /api/billing/availability → { paidPlans: { available, country }, support: { available, country }, paidEntry: boolean }
 * Whether this visitor can start a paid-plan checkout (US-only for now) or give support (everywhere while the
 * support_international switch is on), so buttons can offer the waitlist instead of a checkout that refuses.
 */
import { NextResponse } from "next/server";
import { paidPlanAvailability, paidTicketsEnabled, supportAvailability } from "@/lib/billing/availability";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const [support, paidEntry] = await Promise.all([supportAvailability(request), paidTicketsEnabled()]);
  return NextResponse.json({ paidPlans: paidPlanAvailability(request), support, paidEntry }, { headers: { "Cache-Control": "private, no-store" } });
}
