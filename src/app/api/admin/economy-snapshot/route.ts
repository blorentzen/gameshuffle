/**
 * GET /api/admin/economy-snapshot
 *
 * Returns a live ecosystem-wide snapshot of the token economy
 * (computed at request time — no caching) plus the recent persisted
 * snapshots from `gs_economy_snapshots` for trend context.
 *
 * Live snapshot drives the hero stats — staff sees the current
 * state right now, including any movement since the last daily
 * snapshot was taken. The historical rows let staff see whether
 * net inflation is trending up or down.
 *
 * Read-only — no PUT/DELETE. The snapshot table is populated by
 * the daily cron (`takeDailySnapshot`). Staff who want to force a
 * snapshot today can hit the existing cron endpoint.
 *
 * Staff/admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import {
  liveSnapshot,
  recentSnapshots,
  type SnapshotRow,
} from "@/lib/economy/policy/snapshot";

export const runtime = "nodejs";

async function requireStaff(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Compute the live ecosystem-wide snapshot. This is the headline —
  // staff sees the current state including any movement since the
  // last daily snapshot was taken.
  let live: SnapshotRow;
  try {
    live = await liveSnapshot(null);
  } catch (err) {
    console.error("[economy-snapshot] live snapshot failed:", err);
    return NextResponse.json(
      { error: "snapshot_compute_failed" },
      { status: 500 },
    );
  }

  // Pull the last 30 persisted snapshots for trend context. These
  // are the daily cron's output; staff can see whether net inflation
  // is trending up or down day-over-day.
  let history: Array<SnapshotRow & { taken_at: string }> = [];
  try {
    history = await recentSnapshots({ communityId: null, limit: 30 });
  } catch (err) {
    console.error("[economy-snapshot] history load failed:", err);
    // History failure shouldn't block live — return what we have.
  }

  return NextResponse.json({
    ok: true,
    live,
    history,
    fetchedAt: new Date().toISOString(),
  });
}
