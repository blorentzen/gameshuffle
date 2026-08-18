"use client";

/**
 * PlatformGrowthTab — the lifecycle / growth admin view (staff/admin). Shows
 * signups, mutually-exclusive activity segments (by last_seen_at), churn (from
 * the deletion log, with reasons), and marketing opt-ins. Each activity segment
 * exports its consent-respecting (opted-in only) email list for remarketing.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";

type ActivitySegment = "active" | "dormant" | "at_risk" | "cold" | "never_seen";

const SEGMENTS: { key: ActivitySegment; label: string; hint: string }[] = [
  { key: "active", label: "Active", hint: "Seen in the last 7 days" },
  { key: "dormant", label: "Dormant", hint: "7–30 days" },
  { key: "at_risk", label: "At risk", hint: "30–90 days" },
  { key: "cold", label: "Cold", hint: "90+ days" },
  { key: "never_seen", label: "Never active", hint: "No activity recorded" },
];

interface Summary {
  totalUsers: number;
  signups7d: number;
  signups30d: number;
  segments: Record<ActivitySegment, number>;
  churn30d: number;
  churnTotal: number;
  churnReasons: { reason: string; label: string; count: number }[];
  marketingOptIns: number;
  generatedAt: string;
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div
      style={{
        flex: "1 1 9rem",
        minWidth: "9rem",
        padding: "var(--spacing-16)",
        borderRadius: "var(--radius-12, 12px)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-default)",
      }}
    >
      <div style={{ fontSize: "var(--font-size-28)", fontWeight: "var(--font-weight-bold)", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
      {sub ? <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{sub}</div> : null}
    </div>
  );
}

export function PlatformGrowthTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/lifecycle", { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const body = await res.json();
        setSummary(body.summary as Summary);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Growth &amp; Lifecycle</h2>
      <p className="account-tab__intro" style={{ marginTop: 0 }}>
        Signups, activity, and churn across the user base. Export any segment&rsquo;s marketing
        opt-ins for a remarketing campaign (only opted-in emails are included).
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : error || !summary ? (
        <p style={{ color: "var(--text-secondary)" }}>Couldn&rsquo;t load lifecycle data.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-12)", marginBottom: "var(--spacing-24)" }}>
            <Metric label="Total users" value={summary.totalUsers} />
            <Metric label="Signups" value={summary.signups7d} sub={`${summary.signups30d} in 30d`} />
            <Metric label="Marketing opt-ins" value={summary.marketingOptIns} />
            <Metric label="Churn (30d)" value={summary.churn30d} sub={`${summary.churnTotal} all-time`} />
          </div>

          <h3 className="stream-tools__heading">Activity segments</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)", marginBottom: "var(--spacing-24)" }}>
            {SEGMENTS.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-12)",
                  padding: "var(--spacing-12) var(--spacing-16)",
                  borderRadius: 8,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-default)",
                }}
              >
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <strong>{s.label}</strong>{" "}
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>· {s.hint}</span>
                </div>
                <span style={{ fontWeight: "var(--font-weight-bold)", minWidth: "3rem", textAlign: "right" }}>
                  {summary.segments[s.key] ?? 0}
                </span>
                <a
                  href={`/api/admin/lifecycle/export?segment=${s.key}`}
                  className="hub-detail__header-link-action"
                  style={{ textDecoration: "none" }}
                >
                  <Button variant="secondary" size="small">
                    Export opted-in
                  </Button>
                </a>
              </div>
            ))}
          </div>

          <h3 className="stream-tools__heading">Why people leave</h3>
          {summary.churnReasons.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
              No deletions logged yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {summary.churnReasons.map((r) => (
                <div
                  key={r.reason}
                  style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontSize: "var(--font-size-14)" }}
                >
                  <span>{r.label}</span>
                  <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--text-secondary)" }}>{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
