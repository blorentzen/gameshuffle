"use client";

/**
 * PlatformHealthTab — all-up real-time staff dashboard.
 *
 * Distinct from the Economy Snapshot tab (which is token-flow
 * focused). This is the platform-wide ops view: live counters,
 * audience metrics, throughput, and growth dials.
 *
 * Auto-refreshes every 30 seconds so staff can leave the tab open
 * during a high-traffic stream and watch numbers move. Manual
 * Refresh button for on-demand pulls between the cadence.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card } from "@empac/cascadeds";

interface HealthPayload {
  rightNow: {
    activeSessions: number;
    activeStreams: number;
    activeTournaments: number;
  };
  audience: {
    totalAccounts: number;
    totalIdentities: number;
    twitchIdentities: number;
    discordIdentities: number;
    totalCommunities: number;
    dau: number;
    wau: number;
    mau: number;
  };
  throughput: {
    tokenEventsLastHour: number;
    tokenVolumeLastHour: number;
    engagementSignalsLastHour: number;
  };
  growth: {
    signupsToday: number;
    signupsThisWeek: number;
    signupsThisMonth: number;
  };
  fetchedAt: string;
}

const AUTO_REFRESH_MS = 30_000;
const numberFormat = new Intl.NumberFormat("en-US");
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : numberFormat.format(n);

function StatCard({
  label,
  value,
  helper,
  emphasis,
}: {
  label: string;
  value: string;
  helper?: string;
  emphasis?: boolean;
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
          color: "var(--text-primary)",
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
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
        {title}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--spacing-12)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function PlatformHealthTab() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/platform-health", {
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
      setData(body as HealthPayload);
    } catch {
      setLoadError("Network error while loading.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => {
      void load();
    }, AUTO_REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
          <h2 className="account-tab__heading">Platform health</h2>
          <p className="account-tab__intro" style={{ marginTop: 0 }}>
            All-up real-time view of platform activity. Auto-refreshes
            every 30 seconds — leave it open during a high-traffic
            stream and watch the dials move. Manual Refresh is
            available between auto-pulls.
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
          <Section title="Right now">
            <StatCard
              label="Active sessions"
              value={fmt(data.rightNow.activeSessions)}
              helper="Lounge sessions in any phase except complete."
              emphasis
            />
            <StatCard
              label="Live streams"
              value={fmt(data.rightNow.activeStreams)}
              helper="gs_streams in `open` or `ending` state."
              emphasis
            />
            <StatCard
              label="Active tournaments"
              value={fmt(data.rightNow.activeTournaments)}
              helper="Tournaments not yet completed / cancelled / archived."
              emphasis
            />
          </Section>

          <Section title="Audience">
            <StatCard
              label="DAU"
              value={fmt(data.audience.dau)}
              helper="Distinct identities with token activity in the last 24h."
            />
            <StatCard
              label="WAU"
              value={fmt(data.audience.wau)}
              helper="Distinct identities — last 7 days."
            />
            <StatCard
              label="MAU"
              value={fmt(data.audience.mau)}
              helper="Distinct identities — last 30 days."
            />
            <StatCard
              label="Total accounts"
              value={fmt(data.audience.totalAccounts)}
              helper="Signed-up GameShuffle users (auth.users)."
            />
            <StatCard
              label="Total identities"
              value={fmt(data.audience.totalIdentities)}
              helper="Every per-platform identity row (Twitch, Discord, …)."
            />
            <StatCard
              label="Twitch identities"
              value={fmt(data.audience.twitchIdentities)}
              helper="Subset of total identities on the twitch platform."
            />
            <StatCard
              label="Discord identities"
              value={fmt(data.audience.discordIdentities)}
              helper="Subset of total identities on discord."
            />
            <StatCard
              label="Communities"
              value={fmt(data.audience.totalCommunities)}
              helper="Streamer communities with an active gs_communities row."
            />
          </Section>

          <Section title="Throughput (last hour)">
            <StatCard
              label="Token events / hr"
              value={fmt(data.throughput.tokenEventsLastHour)}
              helper="Count of token_events rows written in the last hour."
            />
            <StatCard
              label="Token volume / hr"
              value={fmt(data.throughput.tokenVolumeLastHour)}
              helper="Sum of |amount| across last-hour token_events. Currency exchanging hands."
            />
            <StatCard
              label="Engagement signals / hr"
              value={fmt(data.throughput.engagementSignalsLastHour)}
              helper="gs_engagement_signals rows in the last hour."
            />
          </Section>

          <Section title="Growth">
            <StatCard
              label="Signups today"
              value={fmt(data.growth.signupsToday)}
              helper="New accounts since 00:00 UTC."
            />
            <StatCard
              label="This week"
              value={fmt(data.growth.signupsThisWeek)}
              helper="Last 7 days rolling."
            />
            <StatCard
              label="This month"
              value={fmt(data.growth.signupsThisMonth)}
              helper="Last 30 days rolling."
            />
          </Section>

          <p
            style={{
              marginTop: "var(--spacing-16)",
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
            {" · "}
            auto-refresh every {AUTO_REFRESH_MS / 1000}s
          </p>
        </>
      )}
    </div>
  );
}
