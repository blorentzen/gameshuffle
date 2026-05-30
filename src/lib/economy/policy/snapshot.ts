/**
 * Monetary-policy snapshot computation — Spec 05.
 *
 * Reads `token_events` only — there is no parallel economy storage.
 * Computes:
 *
 *   - total_supply       — sum(amount) in scope (positive balances)
 *   - minted_total       — sum(amount) where type in grant/earn_*
 *   - wagered_volume     — |sum(amount)| where type = 'bet' (prediction
 *                          markets — the only wager surface post-Spec
 *                          07 closed-loop revision)
 *   - active_identities  — distinct identities with at least one event
 *   - gini               — wealth concentration over derived balances
 *   - p50/p90/p99        — balance percentiles
 *
 * Two scopes per run:
 *   - ecosystem-wide (community_id NULL on the snapshot row)
 *   - per-community (one row per gs_communities row)
 *
 * Idempotent at the application layer — re-running on the same UTC
 * day inserts a fresh row, which is fine: the dashboard reads the
 * most recent snapshot per scope.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

const FREE_MINT_TYPES = [
  "grant_start",
  "grant_bust",
  "earn_t1",
  "earn_t2",
  "earn_newcommunity",
] as const;

const PAID_MINT_TYPES = ["award_mint"] as const;

const BURN_TYPES = ["chaos_burn"] as const;

const WAGER_TYPES = ["bet"] as const;

export interface SnapshotRow {
  community_id: string | null;
  total_supply: number;
  /** Free minting volume — grants + earns. Bottom-weighted by Spec 05 §3. */
  minted_free: number;
  /** Paid minting volume — streamer awards via `award_mint`. Spec
   *  05's new tracked term; if this trends faster than `burned`,
   *  the paid-allowance channel is inflating. */
  minted_paid: number;
  /** Burn volume — chaos_burn + abs(negative event_delta). The
   *  inflation thermostat counterweight. */
  burned: number;
  /** net = (free + paid) - burned. Trend near zero or mildly
   *  positive per Spec 05 §3. */
  net_inflation: number;
  /** Retained for backward-compat — set to 0 by the new computer. */
  minted_total: number;
  wagered_volume: number;
  active_identities: number;
  gini: number | null;
  p50_balance: number | null;
  p90_balance: number | null;
  p99_balance: number | null;
}

/**
 * Compute + persist the daily snapshot. Walks every gs_communities
 * row + the ecosystem-wide aggregate in one pass.
 */
export async function takeDailySnapshot(): Promise<{
  ecosystemRow: SnapshotRow;
  perCommunityRows: SnapshotRow[];
  insertedSnapshotIds: number[];
}> {
  const admin = createServiceClient();
  const { data: communitiesData } = await admin
    .from("gs_communities")
    .select("id");
  const communities = ((communitiesData as Array<{ id: string }> | null) ?? []).map(
    (c) => c.id,
  );

  const rows: SnapshotRow[] = [];
  const ecosystemRow = await computeRow(null);
  rows.push(ecosystemRow);
  const perCommunityRows: SnapshotRow[] = [];
  for (const id of communities) {
    const row = await computeRow(id);
    perCommunityRows.push(row);
    rows.push(row);
  }

  const insertedIds: number[] = [];
  for (const row of rows) {
    const { data } = await admin
      .from("gs_economy_snapshots")
      .insert(row)
      .select("id")
      .single();
    if (data) insertedIds.push((data as { id: number }).id);
  }
  return {
    ecosystemRow,
    perCommunityRows,
    insertedSnapshotIds: insertedIds,
  };
}

async function computeRow(communityId: string | null): Promise<SnapshotRow> {
  const admin = createServiceClient();

  // ---- Balances (drive total_supply, active_identities, gini, percentiles)
  const { data: balanceData } = await admin.rpc("gs_economy_balances", {
    p_community_id: communityId,
  });
  const balances = ((balanceData as Array<{ identity_id: string; balance: number }> | null) ?? [])
    .map((r) => Number(r.balance))
    .filter((b) => b > 0)
    .sort((a, b) => a - b);

  const totalSupply = balances.reduce((acc, b) => acc + b, 0);
  const activeIdentities = balances.length;
  const gini = activeIdentities > 1 ? computeGini(balances, totalSupply) : null;
  const p50 = pickPercentile(balances, 0.5);
  const p90 = pickPercentile(balances, 0.9);
  const p99 = pickPercentile(balances, 0.99);

  // ---- Free mint volume (sum over grant/earn types)
  const freeQuery = admin
    .from("token_events")
    .select("amount.sum()")
    .in("type", FREE_MINT_TYPES as unknown as string[]);
  if (communityId) freeQuery.eq("community_id", communityId);
  const { data: freeRows } = await freeQuery;
  const mintedFree = sumAmount(freeRows);

  // ---- Paid mint volume (award_mint only)
  const paidQuery = admin
    .from("token_events")
    .select("amount.sum()")
    .in("type", PAID_MINT_TYPES as unknown as string[]);
  if (communityId) paidQuery.eq("community_id", communityId);
  const { data: paidRows } = await paidQuery;
  const mintedPaid = sumAmount(paidRows);

  // ---- Burn volume (chaos_burn + negative event_delta).
  // chaos_burn rows are always negative; sum and abs.
  const burnQuery = admin
    .from("token_events")
    .select("amount.sum()")
    .in("type", BURN_TYPES as unknown as string[]);
  if (communityId) burnQuery.eq("community_id", communityId);
  const { data: burnRows } = await burnQuery;
  const chaosBurnVolume = Math.abs(sumAmount(burnRows));

  // Negative event_delta contributions — sum of negative-amount
  // event_delta rows. PostgREST can't express sum(filter) so we
  // pull the raw aggregate of all event_delta and adjust if needed.
  const eventNegQuery = admin
    .from("token_events")
    .select("amount.sum()")
    .eq("type", "event_delta")
    .lt("amount", 0);
  if (communityId) eventNegQuery.eq("community_id", communityId);
  const { data: eventNegRows } = await eventNegQuery;
  const eventDeltaNeg = Math.abs(sumAmount(eventNegRows));

  const burned = chaosBurnVolume + eventDeltaNeg;
  const netInflation = mintedFree + mintedPaid - burned;

  // ---- Wagered volume (markets only)
  const wagerQuery = admin
    .from("token_events")
    .select("amount.sum()")
    .in("type", WAGER_TYPES as unknown as string[]);
  if (communityId) wagerQuery.eq("community_id", communityId);
  const { data: wagerRows } = await wagerQuery;
  const wageredVolume = Math.abs(sumAmount(wagerRows));

  return {
    community_id: communityId,
    total_supply: totalSupply,
    minted_free: mintedFree,
    minted_paid: mintedPaid,
    burned,
    net_inflation: netInflation,
    minted_total: 0, // retained col; computer no longer uses it
    wagered_volume: wageredVolume,
    active_identities: activeIdentities,
    gini,
    p50_balance: p50,
    p90_balance: p90,
    p99_balance: p99,
  };
}

/**
 * Gini coefficient — sorted-list closed form. balances must be sorted
 * ascending. Returns null when n < 2 (Gini undefined for a single
 * holder).
 */
function computeGini(sorted: number[], total: number): number {
  const n = sorted.length;
  if (n < 2 || total === 0) return 0;
  // Sum_{i=1..n}(i * balance_i)
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    weighted += (i + 1) * sorted[i];
  }
  const gini = (2 * weighted) / (n * total) - (n + 1) / n;
  return Math.max(0, Math.min(1, Number(gini.toFixed(4))));
}

/** Pick a percentile from a sorted ascending list. */
function pickPercentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

function sumAmount(rows: unknown): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const row = rows[0] as { sum?: number | string | null };
  const v = row.sum;
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? Number(v) : (v ?? 0);
}

// ---------------------------------------------------------------------------
// Live reads (no persistence) — powers "current tick" dashboard panels.
// ---------------------------------------------------------------------------

export async function liveSnapshot(communityId: string | null): Promise<SnapshotRow> {
  return computeRow(communityId);
}

export async function recentSnapshots(args: {
  communityId: string | null;
  limit?: number;
}): Promise<Array<SnapshotRow & { taken_at: string }>> {
  const admin = createServiceClient();
  const query = admin
    .from("gs_economy_snapshots")
    .select(
      "community_id, taken_at, total_supply, minted_free, minted_paid, burned, net_inflation, minted_total, wagered_volume, active_identities, gini, p50_balance, p90_balance, p99_balance",
    )
    .order("taken_at", { ascending: false })
    .limit(args.limit ?? 30);
  if (args.communityId === null) {
    query.is("community_id", null);
  } else {
    query.eq("community_id", args.communityId);
  }
  const { data } = await query;
  return ((data as Array<SnapshotRow & { taken_at: string }> | null) ?? []) as Array<
    SnapshotRow & { taken_at: string }
  >;
}

// ---------------------------------------------------------------------------
// Streamer Leaderboard — engagement counts (Spec 05 §1)
// ---------------------------------------------------------------------------

const ENGAGEMENT_TYPES = ["bet", "chaos_burn"] as const;

export interface StreamerEngagementRow {
  communityId: string;
  slug: string;
  displayName: string | null;
  engagementEvents: number;
  distinctParticipants: number;
}

/**
 * Ranks communities by chat-driven engagement volume — count of bets
 * + chaos burns per window — NOT by tokens. Per Spec 05 §1: ranking
 * by count makes streamer chaos-pricing self-balancing because
 * overpricing reduces fires (count down) rather than increasing
 * dollar-volume (which would reward pricing higher).
 *
 * Windowed by `daysBack` (default 30). Streamers (community owners)
 * are excluded from the participant count via the gs_communities
 * join — they're operators, not engagers.
 */
export async function streamerEngagementLeaderboard(args: {
  daysBack?: number;
  limit?: number;
} = {}): Promise<StreamerEngagementRow[]> {
  const admin = createServiceClient();
  const sinceIso = new Date(
    Date.now() - (args.daysBack ?? 30) * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Pull every engagement event in window + the community map.
  // PostgREST can't express the "exclude owner" + "distinct count"
  // shape in one query, so we aggregate client-side. At v1 volume
  // this is fine; if it ever gets heavy we'll move to a SQL RPC.
  const [{ data: communitiesData }, { data: eventsData }] = await Promise.all([
    admin
      .from("gs_communities")
      .select("id, slug, display_name, owner_identity_id"),
    admin
      .from("token_events")
      .select("community_id, identity_id")
      .in("type", ENGAGEMENT_TYPES as unknown as string[])
      .gte("created_at", sinceIso)
      .not("community_id", "is", null),
  ]);

  const communities =
    (communitiesData as Array<{
      id: string;
      slug: string;
      display_name: string | null;
      owner_identity_id: string;
    }> | null) ?? [];
  const events =
    (eventsData as Array<{ community_id: string; identity_id: string }> | null) ??
    [];

  const byCommunity = new Map<
    string,
    {
      total: number;
      participants: Set<string>;
      owner: string;
    }
  >();
  for (const c of communities) {
    byCommunity.set(c.id, {
      total: 0,
      participants: new Set<string>(),
      owner: c.owner_identity_id,
    });
  }
  for (const e of events) {
    const bucket = byCommunity.get(e.community_id);
    if (!bucket) continue;
    if (e.identity_id === bucket.owner) continue; // exclude streamer
    bucket.total += 1;
    bucket.participants.add(e.identity_id);
  }

  const rows: StreamerEngagementRow[] = communities.map((c) => {
    const bucket = byCommunity.get(c.id)!;
    return {
      communityId: c.id,
      slug: c.slug,
      displayName: c.display_name,
      engagementEvents: bucket.total,
      distinctParticipants: bucket.participants.size,
    };
  });
  rows.sort((a, b) => b.engagementEvents - a.engagementEvents);
  return rows.slice(0, args.limit ?? 20);
}

// ---------------------------------------------------------------------------
// Velocity — events/day by type (Spec 05 §4.3)
// ---------------------------------------------------------------------------

export interface VelocityRow {
  day: string;
  type: string;
  count: number;
}

export async function eventsVelocity(args: {
  daysBack?: number;
} = {}): Promise<VelocityRow[]> {
  const admin = createServiceClient();
  const sinceIso = new Date(
    Date.now() - (args.daysBack ?? 14) * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Pull rows, bucket client-side. PostgREST can't easily DATE_TRUNC.
  const { data } = await admin
    .from("token_events")
    .select("type, created_at")
    .gte("created_at", sinceIso);
  const rows = (data as Array<{ type: string; created_at: string }> | null) ?? [];
  const grouped = new Map<string, number>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10); // ISO date
    const key = `${day}::${r.type}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const out: VelocityRow[] = [];
  for (const [key, count] of grouped.entries()) {
    const [day, type] = key.split("::");
    out.push({ day, type, count });
  }
  out.sort((a, b) => (a.day === b.day ? a.type.localeCompare(b.type) : b.day.localeCompare(a.day)));
  return out;
}

// ---------------------------------------------------------------------------
// New-community-bonus monitor (Spec 05 §4.5)
// ---------------------------------------------------------------------------

export interface NewCommunityBonusRow {
  day: string;
  bonuses: number;
  minted: number;
}

export async function newCommunityBonusTrend(args: {
  daysBack?: number;
} = {}): Promise<NewCommunityBonusRow[]> {
  const admin = createServiceClient();
  const sinceIso = new Date(
    Date.now() - (args.daysBack ?? 30) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data } = await admin
    .from("token_events")
    .select("amount, created_at")
    .eq("type", "earn_newcommunity")
    .gte("created_at", sinceIso);
  const rows = (data as Array<{ amount: number; created_at: string }> | null) ?? [];
  const grouped = new Map<string, { bonuses: number; minted: number }>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const bucket = grouped.get(day) ?? { bonuses: 0, minted: 0 };
    bucket.bonuses += 1;
    bucket.minted += Number(r.amount);
    grouped.set(day, bucket);
  }
  const out: NewCommunityBonusRow[] = [];
  for (const [day, b] of grouped.entries()) {
    out.push({ day, bonuses: b.bonuses, minted: b.minted });
  }
  out.sort((a, b) => b.day.localeCompare(a.day));
  return out;
}
