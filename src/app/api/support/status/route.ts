/**
 * GET /api/support/status → { available, signedIn, supporter, pro, monthly, progress } for the
 * support page and its quiet links (src/components/support/SupportNudge.tsx):
 * the links never show to supporters or GS Pro members, and outside the US
 * the page says support is US only for now.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paidPlanAvailability } from "@/lib/billing/availability";
import { isSupporter, monthProgress, myMonthlySupport, supportSettings } from "@/lib/support/store";
import { isProUser } from "@/lib/subscription-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const available = paidPlanAvailability(req).available;
  // This month's goal and how much of it support covers (public numbers, for the homepage band).
  const [settings, month] = await Promise.all([supportSettings().catch(() => null), monthProgress().catch(() => null)]);
  const progress = settings && settings.goalCents > 0 ? { goalCents: settings.goalCents, raisedCents: month?.raisedCents ?? 0 } : null;
  if (!user) return NextResponse.json({ available, signedIn: false, supporter: false, pro: false, progress }, { headers: { "Cache-Control": "private, no-store" } });
  const [supporter, pro, monthly] = await Promise.all([isSupporter(user.id).catch(() => false), isProUser(user.id).catch(() => false), myMonthlySupport(user.id).catch(() => null)]);
  return NextResponse.json({ available, signedIn: true, supporter, pro, monthly, progress }, { headers: { "Cache-Control": "private, no-store" } });
}
