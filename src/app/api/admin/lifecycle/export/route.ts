/**
 * GET /api/admin/lifecycle/export?segment=<active|dormant|at_risk|cold|never_seen>
 *
 * CSV of the emails in an activity segment who are ALSO opted in to marketing —
 * the consent-respecting list for a remarketing send. Staff/admin only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { getSegmentOptedInEmails, type ActivitySegment } from "@/lib/platform/lifecycle";

export const runtime = "nodejs";

const VALID: ActivitySegment[] = ["active", "dormant", "at_risk", "cold", "never_seen"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const seg = req.nextUrl.searchParams.get("segment") as ActivitySegment | null;
  if (!seg || !VALID.includes(seg)) {
    return NextResponse.json({ error: "bad_segment" }, { status: 400 });
  }

  const emails = await getSegmentOptedInEmails(seg);
  const csv = ["email", ...emails].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gs-${seg}-optedin.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
