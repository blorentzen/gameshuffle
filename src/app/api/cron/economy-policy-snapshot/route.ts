/**
 * GET /api/cron/economy-policy-snapshot
 *
 * Daily snapshot of the monetary-policy metrics — Spec 05 §1.
 * Writes one row per community + one ecosystem-wide row to
 * `gs_economy_snapshots`. The dashboard reads these for trend lines.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Schedule (vercel.json): once a day, post-bust-recovery so the
 * day's bust grants are in scope.
 */

import { NextResponse } from "next/server";
import { takeDailySnapshot } from "@/lib/economy/policy/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/economy-policy-snapshot] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const result = await takeDailySnapshot();
    const durationMs = Date.now() - startedAt;
    console.log("[cron/economy-policy-snapshot]", {
      durationMs,
      communities: result.perCommunityRows.length,
      ecosystemSupply: result.ecosystemRow.total_supply,
      ecosystemGini: result.ecosystemRow.gini,
    });
    return NextResponse.json({
      ok: true,
      durationMs,
      ecosystem: result.ecosystemRow,
      perCommunityCount: result.perCommunityRows.length,
      insertedSnapshotIds: result.insertedSnapshotIds,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error("[cron/economy-policy-snapshot] threw", { durationMs, err });
    return NextResponse.json(
      {
        error: "snapshot_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
