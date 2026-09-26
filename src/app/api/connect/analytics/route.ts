/**
 * GET /api/connect/analytics?days=30 → the organizer's own ticket sales.
 *
 * Headline totals are free; the breakdowns (daily series, per-tier mix) are a
 * paid Circuit organizer feature, so the response says which half the caller is
 * entitled to rather than letting the client decide.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { organizerHasPaidFeatures } from "@/lib/tournaments/circuit-resolve";
import { organizerAnalytics } from "@/lib/events/analytics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30));
  // Same gate as every other paid organizer feature, so it opens and closes
  // with the organizer_billing_enabled flag instead of on its own schedule.
  const detailed = await organizerHasPaidFeatures(createServiceClient(), user.id);

  const analytics = await organizerAnalytics(user.id, days);
  return NextResponse.json(detailed ? { detailed, analytics } : { detailed, analytics: { ...analytics, series: [], byTier: [] } });
}
