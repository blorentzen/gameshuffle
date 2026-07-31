/**
 * GET /api/cron/ideas-expiry
 *
 * Sweeps public ideas past their 60-day window into `expired` (§5.3). The lazy
 * read-filter in the store is the correctness guarantee; this keeps the data
 * clean. Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/ideas-expiry] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_ideas")
    .update({ status: "expired" })
    .eq("status", "public")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expired: (data ?? []).length });
}
