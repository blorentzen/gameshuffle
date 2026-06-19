/**
 * GET /api/admin/platform-health
 *
 * All-up real-time view of platform activity for staff ops:
 *
 *   - Right Now: live sessions, live streams, active tournaments
 *   - Audience:  total accounts/identities/communities, identities
 *                by platform, DAU/WAU/MAU
 *   - Throughput: events + token volume in the last hour
 *   - Growth:    new signups today / this week / this month
 *
 * Distinct from the economy Snapshot (which is token-flow focused).
 * This is the "is anything on fire / how is membership trending?"
 * surface — designed for at-a-glance monitoring once membership
 * picks up.
 *
 * Queries run in parallel where possible. DAU/WAU/MAU bucketing
 * pulls a single 30-day token_events slice and counts distinct
 * identities in JS — cheaper than three separate scans.
 *
 * Staff/admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

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
  const admin = createServiceClient();

  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const WEEK_MS = 7 * DAY_MS;
  const MONTH_MS = 30 * DAY_MS;

  const lastHourIso = new Date(now - HOUR_MS).toISOString();
  const last7dIso = new Date(now - WEEK_MS).toISOString();
  const last30dIso = new Date(now - MONTH_MS).toISOString();
  // Start of today in UTC — signups-today depends on this anchor
  // rather than a rolling 24h so the dial resets at midnight UTC
  // each day (matches how staff reads "today").
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  // Fan out every query in parallel. Each is a thin COUNT or
  // narrow column slice. Promise.all lets the slow query (the
  // 30-day token_events pull) overlap with the cheap counts.
  const [
    activeSessionsRes,
    activeStreamsRes,
    activeTournamentsRes,
    totalAccountsRes,
    totalIdentitiesRes,
    twitchIdentitiesRes,
    discordIdentitiesRes,
    totalCommunitiesRes,
    tokenEventsLastHourRes,
    engagementLastHourRes,
    activeIdentitiesRes,
    signupsTodayRes,
    signupsWeekRes,
    signupsMonthRes,
  ] = await Promise.all([
    admin
      .from("lounge_sessions")
      .select("*", { count: "exact", head: true })
      .neq("phase", "complete"),
    admin
      .from("gs_streams")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "ending"]),
    admin
      .from("tournaments")
      .select("*", { count: "exact", head: true })
      .not("status", "in", "(completed,cancelled,archived)"),
    admin
      .from("users")
      .select("*", { count: "exact", head: true }),
    admin
      .from("gs_identities")
      .select("*", { count: "exact", head: true }),
    admin
      .from("gs_identities")
      .select("*", { count: "exact", head: true })
      .eq("platform", "twitch"),
    admin
      .from("gs_identities")
      .select("*", { count: "exact", head: true })
      .eq("platform", "discord"),
    admin
      .from("gs_communities")
      .select("*", { count: "exact", head: true }),
    // token_events last hour — pull the amounts so we can compute
    // both count and traded volume in one shot.
    admin
      .from("token_events")
      .select("amount", { count: "exact" })
      .gte("created_at", lastHourIso),
    admin
      .from("gs_engagement_signals")
      .select("*", { count: "exact", head: true })
      .gte("created_at", lastHourIso),
    // 30-day slice of (identity_id, created_at) for DAU/WAU/MAU
    // bucketing. Cap at 100k rows — if real traffic ever blows
    // that, we move to a SQL DISTINCT RPC. Plenty of runway for now.
    admin
      .from("token_events")
      .select("identity_id, created_at")
      .gte("created_at", last30dIso)
      .limit(100_000),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStartIso),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last7dIso),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last30dIso),
  ]);

  // ── Throughput: count + traded volume in the last hour. The
  // count is on the response envelope; we sum |amount| for volume.
  const tokenEventsLastHour = tokenEventsLastHourRes.count ?? 0;
  const tokenVolumeLastHour = (
    (tokenEventsLastHourRes.data as Array<{ amount: number }> | null) ?? []
  ).reduce((acc, r) => acc + Math.abs(Number(r.amount) || 0), 0);

  // ── DAU / WAU / MAU bucketing. Distinct identity ids per window.
  // We pre-sort once and walk three thresholds, adding to sets.
  const activeRows =
    (activeIdentitiesRes.data as Array<{
      identity_id: string;
      created_at: string;
    }> | null) ?? [];
  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  const mauSet = new Set<string>();
  const dauCutoff = now - DAY_MS;
  const wauCutoff = now - WEEK_MS;
  for (const r of activeRows) {
    if (!r.identity_id) continue;
    const ts = Date.parse(r.created_at);
    if (Number.isNaN(ts)) continue;
    mauSet.add(r.identity_id);
    if (ts >= wauCutoff) wauSet.add(r.identity_id);
    if (ts >= dauCutoff) dauSet.add(r.identity_id);
  }

  return NextResponse.json({
    ok: true,
    rightNow: {
      activeSessions: activeSessionsRes.count ?? 0,
      activeStreams: activeStreamsRes.count ?? 0,
      activeTournaments: activeTournamentsRes.count ?? 0,
    },
    audience: {
      totalAccounts: totalAccountsRes.count ?? 0,
      totalIdentities: totalIdentitiesRes.count ?? 0,
      twitchIdentities: twitchIdentitiesRes.count ?? 0,
      discordIdentities: discordIdentitiesRes.count ?? 0,
      totalCommunities: totalCommunitiesRes.count ?? 0,
      dau: dauSet.size,
      wau: wauSet.size,
      mau: mauSet.size,
    },
    throughput: {
      tokenEventsLastHour,
      tokenVolumeLastHour,
      engagementSignalsLastHour: engagementLastHourRes.count ?? 0,
    },
    growth: {
      signupsToday: signupsTodayRes.count ?? 0,
      signupsThisWeek: signupsWeekRes.count ?? 0,
      signupsThisMonth: signupsMonthRes.count ?? 0,
    },
    fetchedAt: new Date().toISOString(),
  });
}
