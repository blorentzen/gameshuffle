/**
 * /staff/economy — Monetary-policy dashboard (Spec 05 §3).
 *
 * Staff-gated. Reads `gs_economy_snapshots` for trend + live snapshot
 * for the current tick. Panels:
 *   1. Supply & inflation (total supply trend, minted vs wagered)
 *   2. Distribution — Gini + p50/p90/p99
 *   3. Per-community drill-down
 *
 * Velocity + new-community-bonus monitor surfaces are placeholders
 * (Spec 05 §3 calls them out; v1 ships the supply + distribution
 * panels as primary, the rest can layer in later without schema
 * changes).
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isStaffRequest } from "@/lib/auth/raw";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  eventsVelocity,
  liveSnapshot,
  newCommunityBonusTrend,
  recentSnapshots,
  streamerEngagementLeaderboard,
  type SnapshotRow,
} from "@/lib/economy/policy/snapshot";

export const metadata: Metadata = {
  title: "Economy — Monetary Policy",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface CommunityRow {
  id: string;
  slug: string;
  display_name: string | null;
  latestSnapshot: (SnapshotRow & { taken_at: string }) | null;
  allowance: { ceiling: number; consumed: number; periodMonth: string } | null;
}

async function loadCommunities(): Promise<CommunityRow[]> {
  const admin = createServiceClient();
  const { data: communitiesData } = await admin
    .from("gs_communities")
    .select("id, slug, display_name")
    .order("created_at", { ascending: false });
  const communities = ((communitiesData as Array<{
    id: string;
    slug: string;
    display_name: string | null;
  }> | null) ?? []) as Array<{ id: string; slug: string; display_name: string | null }>;

  // Current month's allowance period as ISO date (first of month UTC).
  const now = new Date();
  const periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const enriched: CommunityRow[] = [];
  for (const c of communities) {
    const recent = await recentSnapshots({ communityId: c.id, limit: 1 });
    const { data: allowanceRow } = await admin
      .from("gs_streamer_allowance")
      .select("ceiling, consumed, period_month")
      .eq("community_id", c.id)
      .eq("period_month", periodMonth)
      .maybeSingle();
    enriched.push({
      id: c.id,
      slug: c.slug,
      display_name: c.display_name,
      latestSnapshot: recent[0] ?? null,
      allowance: allowanceRow
        ? {
            ceiling: Number((allowanceRow as { ceiling: number }).ceiling),
            consumed: Number((allowanceRow as { consumed: number }).consumed),
            periodMonth: String(
              (allowanceRow as { period_month: string }).period_month,
            ),
          }
        : null,
    });
  }
  return enriched;
}

export default async function EconomyDashboardPage() {
  if (!(await isStaffRequest())) {
    notFound();
  }

  // Live ecosystem-wide snapshot for the "current" panel.
  const live = await liveSnapshot(null);
  // Last 30 daily snapshots for trend.
  const trend = await recentSnapshots({ communityId: null, limit: 30 });
  const communities = await loadCommunities();
  // Streamer Leaderboard + velocity + new-community-bonus monitor —
  // Spec 05 §1 + §4.3 + §4.5. All derive from `token_events`.
  const [streamerBoard, velocity, ncBonus] = await Promise.all([
    streamerEngagementLeaderboard({ daysBack: 7, limit: 10 }),
    eventsVelocity({ daysBack: 14 }),
    newCommunityBonusTrend({ daysBack: 30 }),
  ]);

  // Spec 05 §3: minted ÷ supply has been replaced by the explicit
  // free / paid / burn breakdown + net inflation. Keep a derived
  // share for legibility on the supply panel.
  const totalMinted = live.minted_free + live.minted_paid;
  const mintedShare =
    live.total_supply > 0
      ? Math.round((totalMinted / live.total_supply) * 100)
      : 0;

  return (
    <div className="economy-dashboard">
      <header className="economy-dashboard__header">
        <h1>Monetary Policy</h1>
        <p className="economy-dashboard__subtitle">
          Read-only view over <code>token_events</code>. Daily snapshots in
          <code> gs_economy_snapshots</code>. Tune knobs in
          <code> gs_economy_config</code>.
        </p>
      </header>

      <section className="economy-dashboard__panel">
        <h2>Ecosystem — current tick</h2>
        <dl className="economy-dashboard__metrics">
          <div>
            <dt>Total supply</dt>
            <dd>{live.total_supply.toLocaleString("en-US")}🪙</dd>
          </div>
          <div>
            <dt>Active identities</dt>
            <dd>{live.active_identities.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Minted total</dt>
            <dd>
              {totalMinted.toLocaleString("en-US")}🪙
              <span className="economy-dashboard__hint"> ({mintedShare}% of supply)</span>
            </dd>
          </div>
          <div>
            <dt>Wagered volume</dt>
            <dd>{live.wagered_volume.toLocaleString("en-US")}🪙</dd>
          </div>
        </dl>
      </section>

      <section className="economy-dashboard__panel">
        <h2>Inflation equation</h2>
        <p className="economy-dashboard__hint">
          Spec 05 §3: <code>net = (minted_free + minted_paid) − burned</code>.
          Watch <strong>minted_paid</strong> against <strong>burned</strong> —
          if paid mint grows faster than burn, the streamer-allowance channel
          is inflating.
        </p>
        <dl className="economy-dashboard__metrics">
          <div>
            <dt>Minted (free)</dt>
            <dd>{live.minted_free.toLocaleString("en-US")}🪙</dd>
          </div>
          <div>
            <dt>Minted (paid / award_mint)</dt>
            <dd>{live.minted_paid.toLocaleString("en-US")}🪙</dd>
          </div>
          <div>
            <dt>Burned</dt>
            <dd>{live.burned.toLocaleString("en-US")}🪙</dd>
          </div>
          <div>
            <dt>Net inflation</dt>
            <dd
              className={
                live.net_inflation > 0
                  ? "economy-dashboard__net-inflation--positive"
                  : "economy-dashboard__net-inflation--negative"
              }
            >
              {live.net_inflation >= 0 ? "+" : ""}
              {live.net_inflation.toLocaleString("en-US")}🪙
            </dd>
          </div>
        </dl>
      </section>

      <section className="economy-dashboard__panel">
        <h2>Distribution</h2>
        <dl className="economy-dashboard__metrics">
          <div>
            <dt>Gini</dt>
            <dd>{live.gini === null ? "—" : live.gini.toFixed(3)}</dd>
          </div>
          <div>
            <dt>p50 balance</dt>
            <dd>{formatPercentile(live.p50_balance)}</dd>
          </div>
          <div>
            <dt>p90 balance</dt>
            <dd>{formatPercentile(live.p90_balance)}</dd>
          </div>
          <div>
            <dt>p99 balance</dt>
            <dd>{formatPercentile(live.p99_balance)}</dd>
          </div>
        </dl>
        <p className="economy-dashboard__hint">
          Spec 05 §3: rising Gini = concentration. Counter via{" "}
          <code>bust_recovery_amount</code> / <code>new_community_bonus</code>
          increases, or <code>daily_earn_ceiling</code> for top earners.
        </p>
      </section>

      <section className="economy-dashboard__panel">
        <h2>Trend — last {trend.length} snapshots</h2>
        {trend.length === 0 ? (
          <p className="economy-dashboard__empty">
            No snapshots yet. The first run of <code>economy-policy-snapshot</code>
            cron will populate this.
          </p>
        ) : (
          <div className="economy-dashboard__scroll">
            <table className="economy-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Taken at</th>
                  <th scope="col">Supply</th>
                  <th scope="col">Free mint</th>
                  <th scope="col">Paid mint</th>
                  <th scope="col">Burned</th>
                  <th scope="col">Net inflation</th>
                  <th scope="col">Gini</th>
                  <th scope="col">p50 / p90 / p99</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((row) => (
                  <tr key={row.taken_at}>
                    <td>{formatDate(row.taken_at)}</td>
                    <td>{row.total_supply.toLocaleString("en-US")}</td>
                    <td>{row.minted_free.toLocaleString("en-US")}</td>
                    <td>{row.minted_paid.toLocaleString("en-US")}</td>
                    <td>{row.burned.toLocaleString("en-US")}</td>
                    <td>
                      {row.net_inflation >= 0 ? "+" : ""}
                      {row.net_inflation.toLocaleString("en-US")}
                    </td>
                    <td>{row.gini === null ? "—" : row.gini.toFixed(3)}</td>
                    <td>
                      {formatPercentile(row.p50_balance)} /{" "}
                      {formatPercentile(row.p90_balance)} /{" "}
                      {formatPercentile(row.p99_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="economy-dashboard__panel">
        <h2>Streamer-allowance utilization — current month</h2>
        <p className="economy-dashboard__hint">
          Spec 05 §4.6: total <code>award_mint</code> consumed against each
          community&rsquo;s monthly ceiling. Headroom warns where the cap
          might constrain the streamer; near-zero headroom flags possible
          ceiling-tuning need.
        </p>
        {communities.length === 0 ? (
          <p className="economy-dashboard__empty">
            No communities yet.
          </p>
        ) : (
          <div className="economy-dashboard__scroll">
            <table className="economy-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Slug</th>
                  <th scope="col">Ceiling</th>
                  <th scope="col">Consumed</th>
                  <th scope="col">Remaining</th>
                  <th scope="col">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {communities.map((c) => {
                  const a = c.allowance;
                  if (!a) {
                    return (
                      <tr key={c.id}>
                        <td>
                          <code>{c.slug}</code>
                        </td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    );
                  }
                  const remaining = Math.max(0, a.ceiling - a.consumed);
                  const utilization =
                    a.ceiling > 0
                      ? Math.round((a.consumed / a.ceiling) * 100)
                      : 0;
                  return (
                    <tr key={c.id}>
                      <td>
                        <code>{c.slug}</code>
                      </td>
                      <td>{a.ceiling.toLocaleString("en-US")}</td>
                      <td>{a.consumed.toLocaleString("en-US")}</td>
                      <td>{remaining.toLocaleString("en-US")}</td>
                      <td>{utilization}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="economy-dashboard__panel">
        <h2>Per-community ({communities.length})</h2>
        {communities.length === 0 ? (
          <p className="economy-dashboard__empty">
            No communities yet. The first streamer interaction creates one.
          </p>
        ) : (
          <div className="economy-dashboard__scroll">
            <table className="economy-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Slug</th>
                  <th scope="col">Display</th>
                  <th scope="col">Supply</th>
                  <th scope="col">Identities</th>
                  <th scope="col">Gini</th>
                  <th scope="col">p50 / p90</th>
                  <th scope="col">Last snap</th>
                </tr>
              </thead>
              <tbody>
                {communities.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <code>{c.slug}</code>
                    </td>
                    <td>{c.display_name ?? "—"}</td>
                    <td>
                      {c.latestSnapshot
                        ? c.latestSnapshot.total_supply.toLocaleString("en-US")
                        : "—"}
                    </td>
                    <td>{c.latestSnapshot ? c.latestSnapshot.active_identities : "—"}</td>
                    <td>
                      {c.latestSnapshot && c.latestSnapshot.gini !== null
                        ? c.latestSnapshot.gini.toFixed(3)
                        : "—"}
                    </td>
                    <td>
                      {c.latestSnapshot
                        ? `${formatPercentile(c.latestSnapshot.p50_balance)} / ${formatPercentile(c.latestSnapshot.p90_balance)}`
                        : "—"}
                    </td>
                    <td>{c.latestSnapshot ? formatDate(c.latestSnapshot.taken_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="economy-dashboard__panel">
        <h2>Streamer Leaderboard — engagement counts (7d)</h2>
        <p className="economy-dashboard__hint">
          Spec 05 §1: ranked by chat engagement <em>volume</em> (bets +
          chaos burns), not token value. Counting events makes chaos
          pricing self-balancing — overpricing reduces fires, not rank.
        </p>
        {streamerBoard.length === 0 ? (
          <p className="economy-dashboard__empty">
            No engagement events in window.
          </p>
        ) : (
          <div className="economy-dashboard__scroll">
            <table className="economy-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Community</th>
                  <th scope="col">Engagement events</th>
                  <th scope="col">Distinct participants</th>
                </tr>
              </thead>
              <tbody>
                {streamerBoard.map((row, idx) => (
                  <tr key={row.communityId}>
                    <td>{idx + 1}</td>
                    <td>
                      <code>{row.slug}</code>
                      {row.displayName && (
                        <span className="economy-dashboard__hint">
                          {" "}— {row.displayName}
                        </span>
                      )}
                    </td>
                    <td>{row.engagementEvents.toLocaleString("en-US")}</td>
                    <td>{row.distinctParticipants.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="economy-dashboard__panel">
        <h2>Velocity — events/day by type (14d)</h2>
        <p className="economy-dashboard__hint">
          Spec 05 §4.3: dead vs active economies. Watch <code>bet</code>{" "}
          and <code>chaos_burn</code> — they&rsquo;re the chat-driven
          engagement signals.
        </p>
        {velocity.length === 0 ? (
          <p className="economy-dashboard__empty">No events in window.</p>
        ) : (
          <div className="economy-dashboard__scroll">
            <table className="economy-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Type</th>
                  <th scope="col">Count</th>
                </tr>
              </thead>
              <tbody>
                {velocity.map((row) => (
                  <tr key={`${row.day}-${row.type}`}>
                    <td>{row.day}</td>
                    <td>
                      <code>{row.type}</code>
                    </td>
                    <td>{row.count.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="economy-dashboard__panel">
        <h2>New-community-bonus monitor (30d)</h2>
        <p className="economy-dashboard__hint">
          Spec 05 §4.5: <code>earn_newcommunity</code> volume. Flags
          exploration-minting heating up as the ecosystem grows.
        </p>
        {ncBonus.length === 0 ? (
          <p className="economy-dashboard__empty">No new-community bonuses fired.</p>
        ) : (
          <div className="economy-dashboard__scroll">
            <table className="economy-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Bonuses fired</th>
                  <th scope="col">Total minted</th>
                </tr>
              </thead>
              <tbody>
                {ncBonus.map((row) => (
                  <tr key={row.day}>
                    <td>{row.day}</td>
                    <td>{row.bonuses.toLocaleString("en-US")}</td>
                    <td>{row.minted.toLocaleString("en-US")}🪙</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatPercentile(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("en-US")}🪙`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace("T", " ");
}
