/**
 * GET /api/cron/ideas-expiry
 *
 * Sweeps public ideas past their 60-day window into `expired` (§5.3). The lazy
 * read-filter in the store is the correctness guarantee; this keeps the data
 * clean. Also clears upload parts nobody came back for (src/lib/uploads/parts.ts:
 * a browser that stopped halfway leaves them in storage) once they're a day old.
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isR2Configured, sweepR2 } from "@/lib/storage/r2";
import { PARTS_PREFIX } from "@/lib/uploads/partsServer";

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

  const parts = isR2Configured() ? await sweepR2(PARTS_PREFIX, new Date(Date.now() - 24 * 60 * 60_000)) : 0;
  if (error) return NextResponse.json({ error: error.message, parts }, { status: 500 });
  return NextResponse.json({ ok: true, expired: (data ?? []).length, parts });
}
