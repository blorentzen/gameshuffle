/**
 * GET /api/account/engagement-leaderboard
 *
 * Returns the top-N most engaged viewers in the authenticated
 * streamer's community for either:
 *   - the active GameShuffle session (when there's one), or
 *   - the last 60 minutes (off-stream snapshot)
 *
 * Each row carries the viewer's display name + total weighted
 * score + a per-type breakdown so the UI can show "what's driving
 * the number" without a second round trip.
 *
 * Query params:
 *   ?limit=N    cap rows (default 20, max 50)
 *   ?windowMs=  override the lookback window in ms (default 1h)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";

export const runtime = "nodejs";

type SignalType =
  | "command_fired"
  | "event_fired"
  | "social_action"
  | "token_earned"
  | "token_spent";

interface SignalRow {
  identity_id: string;
  signal_type: SignalType;
  weight: number;
}

interface IdentityRow {
  id: string;
  display_name: string | null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) {
    return NextResponse.json({ error: "no_community" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(
    50,
    Math.max(1, Number.isInteger(limitParam) ? limitParam : 20),
  );
  const windowParam = parseInt(searchParams.get("windowMs") ?? "3600000", 10);
  const windowMs =
    Number.isInteger(windowParam) && windowParam > 0
      ? windowParam
      : 60 * 60 * 1000;
  const sinceIso = new Date(Date.now() - windowMs).toISOString();

  // Prefer the active session as the scope when one exists — it's
  // the natural "this stream" frame. When off-stream, fall back to
  // time-windowed across the community so the dashboard still has
  // data to show.
  const session = await findTwitchSessionForUser(user.id, ["active", "test"]);
  const sessionId = (session as { id?: string } | null)?.id ?? null;

  const admin = createServiceClient();
  let query = admin
    .from("gs_engagement_signals")
    .select("identity_id, signal_type, weight")
    .eq("community_id", communityId)
    .gte("created_at", sinceIso);
  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate per identity in JS — Supabase's PostgREST doesn't
  // expose GROUP BY without a stored proc, and the signal volume
  // per session is well within "scan + sum" territory.
  const totals = new Map<
    string,
    { score: number; byType: Partial<Record<SignalType, number>> }
  >();
  for (const row of (data as SignalRow[] | null) ?? []) {
    const entry = totals.get(row.identity_id) ?? {
      score: 0,
      byType: {} as Partial<Record<SignalType, number>>,
    };
    entry.score += row.weight;
    entry.byType[row.signal_type] =
      (entry.byType[row.signal_type] ?? 0) + row.weight;
    totals.set(row.identity_id, entry);
  }

  const sorted = Array.from(totals.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  // Resolve display names for the top set. Single batched IN().
  const displayByid = new Map<string, string>();
  if (sorted.length > 0) {
    const ids = sorted.map(([id]) => id);
    const { data: identityRows } = await admin
      .from("gs_identities")
      .select("id, display_name")
      .in("id", ids);
    for (const row of (identityRows as IdentityRow[] | null) ?? []) {
      if (row.display_name) displayByid.set(row.id, row.display_name);
    }
  }

  return NextResponse.json({
    ok: true,
    scope: sessionId ? "session" : "window",
    sessionId,
    windowMs,
    leaderboard: sorted.map(([identityId, entry], idx) => ({
      rank: idx + 1,
      identityId,
      displayName: displayByid.get(identityId) ?? "(unknown)",
      score: entry.score,
      breakdown: entry.byType,
    })),
  });
}
