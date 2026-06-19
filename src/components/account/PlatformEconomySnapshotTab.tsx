"use client";

/**
 * PlatformEconomySnapshotTab — staff/admin-only dashboard for the
 * token economy's current state and recent trend.
 *
 * Reads the live ecosystem-wide snapshot via the existing
 * `liveSnapshot(null)` computer, plus the last 30 persisted daily
 * snapshots from `gs_economy_snapshots`. The hero stats answer
 * "what's the economy doing right now?", the history table answers
 * "what's the trend?"
 *
 * No charts — first pass keeps it readable with stat cards + a
 * dense numeric table. Adding sparkline visuals is a clean
 * additive follow-up if staff start using this regularly.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card } from "@empac/cascadeds";

interface SnapshotRow {
  community_id: string | null;
  total_supply: number;
  minted_free: number;
  minted_paid: number;
  burned: number;
  net_inflation: number;
  minted_total: number;
  wagered_volume: number;
  active_identities: number;
  gini: number | null;
  p50_balance: number | null;
  p90_balance: number | null;
  p99_balance: number | null;
}

interface ApiResponse {
  ok: true;
  live: SnapshotRow;
  history: Array<SnapshotRow & { taken_at: string }>;
  fetchedAt: string;
}

const tokenFormat = new Intl.NumberFormat("en-US");
const decimalFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
});

function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return tokenFormat.format(value);
}

function formatGini(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return decimalFormat.format(value);
}

function inflationColor(net: number): string {
  if (net > 0) return "var(--text-warning, var(--text-primary))";
  if (net < 0) return "var(--text-success, var(--text-primary))";
  return "var(--text-secondary)";
}

function StatCard({
  label,
  value,
  helper,
  emphasis,
  colorOverride,
}: {
  label: string;
  value: string;
  helper?: string;
  emphasis?: boolean;
  colorOverride?: string;
}) {
  return (
    <Card variant="outlined" padding="medium">
      <p
        style={{
          margin: 0,
          fontSize: "var(--font-size-12)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-tertiary)",
          fontWeight: "var(--font-weight-semibold)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "var(--spacing-8) 0 0",
          fontSize: emphasis
            ? "var(--font-size-32)"
            : "var(--font-size-24)",
          fontWeight: "var(--font-weight-bold)",
          color: colorOverride ?? "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
      {helper && (
        <p
          style={{
            margin: "var(--spacing-4) 0 0",
            fontSize: "var(--font-size-12)",
            color: "var(--text-secondary)",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          {helper}
        </p>
      )}
    </Card>
  );
}

export function PlatformEconomySnapshotTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/economy-snapshot", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setLoadError("Forbidden — staff only.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        return;
      }
      setData(body as ApiResponse);
    } catch {
      setLoadError("Network error while loading.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="account-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--spacing-16)",
          flexWrap: "wrap",
          marginBottom: "var(--spacing-32)",
        }}
      >
        <div>
          <h2 className="account-tab__heading">Economy snapshot</h2>
          <p className="account-tab__intro" style={{ marginTop: 0 }}>
            Live ecosystem-wide view of the token economy. Hero
            stats are computed at request time — they include any
            movement since the most recent daily snapshot was
            persisted. The history table below pulls from{" "}
            <code>gs_economy_snapshots</code>, populated by the
            daily cron.
          </p>
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={() => void load()}
          loading={refreshing}
          disabled={refreshing}
        >
          Refresh
        </Button>
      </div>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {data === null ? (
        <p className="account-tab__empty">Loading…</p>
      ) : (
        <>
          {/* ── Hero stats ─────────────────────────────────────── */}
          <section style={{ marginBottom: "var(--spacing-32)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "var(--spacing-12)",
              }}
            >
              <StatCard
                label="Total supply"
                value={formatTokens(data.live.total_supply)}
                helper="Sum of positive balances across every identity."
                emphasis
              />
              <StatCard
                label="Active identities"
                value={formatTokens(data.live.active_identities)}
                helper="Distinct identities with a positive balance."
              />
              <StatCard
                label="Net inflation"
                value={formatTokens(data.live.net_inflation)}
                helper="(Free + paid mint) − burned. Should trend near zero or mildly positive."
                colorOverride={inflationColor(data.live.net_inflation)}
              />
              <StatCard
                label="Gini coefficient"
                value={formatGini(data.live.gini)}
                helper="Wealth concentration: 0 = perfectly equal, 1 = single holder. Watch for runaway concentration."
              />
            </div>
          </section>

          {/* ── Mint / Burn / Wager breakdown ─────────────────── */}
          <section style={{ marginBottom: "var(--spacing-32)" }}>
            <h3
              style={{
                fontSize: "var(--font-size-14)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--text-secondary)",
                margin: "0 0 var(--spacing-12)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Flow components
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "var(--spacing-12)",
              }}
            >
              <StatCard
                label="Minted (free)"
                value={formatTokens(data.live.minted_free)}
                helper="Grants + earns. Bottom-weighted per Spec 05 §3."
              />
              <StatCard
                label="Minted (paid)"
                value={formatTokens(data.live.minted_paid)}
                helper="Streamer awards via award_mint. Trending faster than burn = paid channel inflating."
              />
              <StatCard
                label="Burned"
                value={formatTokens(data.live.burned)}
                helper="chaos_burn + |negative event_delta|. The inflation thermostat counterweight."
              />
              <StatCard
                label="Wagered volume"
                value={formatTokens(data.live.wagered_volume)}
                helper="Prediction-market bet volume in scope. Closed-loop since Spec 07."
              />
            </div>
          </section>

          {/* ── Balance distribution ─────────────────────────── */}
          <section style={{ marginBottom: "var(--spacing-32)" }}>
            <h3
              style={{
                fontSize: "var(--font-size-14)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--text-secondary)",
                margin: "0 0 var(--spacing-12)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Balance distribution
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "var(--spacing-12)",
              }}
            >
              <StatCard
                label="p50"
                value={formatTokens(data.live.p50_balance)}
                helper="Median balance. 50% of viewers hold less than this."
              />
              <StatCard
                label="p90"
                value={formatTokens(data.live.p90_balance)}
                helper="90th percentile. The top decile starts here."
              />
              <StatCard
                label="p99"
                value={formatTokens(data.live.p99_balance)}
                helper="99th percentile. Outlier band."
              />
            </div>
          </section>

          {/* ── History table ────────────────────────────────── */}
          <section>
            <h3
              style={{
                fontSize: "var(--font-size-14)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--text-secondary)",
                margin: "0 0 var(--spacing-12)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Recent snapshots ({data.history.length})
            </h3>
            {data.history.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-14)",
                  color: "var(--text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                No daily snapshots yet. The cron writes one per day;
                the live stats above are still accurate.
              </p>
            ) : (
              <Card variant="outlined" padding="medium">
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "var(--font-size-14)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          textAlign: "right",
                          color: "var(--text-secondary)",
                          fontSize: "var(--font-size-12)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                            textAlign: "left",
                          }}
                        >
                          Day
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Supply
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Mint (free)
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Mint (paid)
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Burned
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Net
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Active
                        </th>
                        <th
                          style={{
                            padding:
                              "var(--spacing-8) var(--spacing-12)",
                          }}
                        >
                          Gini
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((row) => (
                        <tr
                          key={row.taken_at}
                          style={{
                            borderTop:
                              "1px solid var(--border-default)",
                            textAlign: "right",
                            color: "var(--text-primary)",
                          }}
                        >
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                              textAlign: "left",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {row.taken_at.slice(0, 10)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                            }}
                          >
                            {formatTokens(row.total_supply)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                            }}
                          >
                            {formatTokens(row.minted_free)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                            }}
                          >
                            {formatTokens(row.minted_paid)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                            }}
                          >
                            {formatTokens(row.burned)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                              color: inflationColor(
                                row.net_inflation,
                              ),
                              fontWeight:
                                "var(--font-weight-semibold)",
                            }}
                          >
                            {formatTokens(row.net_inflation)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                            }}
                          >
                            {formatTokens(row.active_identities)}
                          </td>
                          <td
                            style={{
                              padding:
                                "var(--spacing-8) var(--spacing-12)",
                            }}
                          >
                            {formatGini(row.gini)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          <p
            style={{
              marginTop: "var(--spacing-24)",
              fontSize: "var(--font-size-12)",
              color: "var(--text-tertiary)",
              textAlign: "right",
            }}
          >
            Fetched{" "}
            {new Date(data.fetchedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </>
      )}
    </div>
  );
}
