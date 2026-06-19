"use client";

/**
 * EngagementTab — streamer-facing view of who's most engaged in
 * their community.
 *
 * Phase 2 shows the top-N viewers for either the active session
 * (when one exists) or the last hour (off-stream snapshot). Each
 * row carries the viewer's display name, total score, rank, and a
 * per-type breakdown so the streamer sees what drove the number.
 *
 * No polling — refresh is manual. Engagement is a glance-at-it
 * surface, not a real-time HUD. Adding live updates is cheap
 * (10s setInterval) when product needs it.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card } from "@empac/cascadeds";

type SignalType =
  | "command_fired"
  | "event_fired"
  | "social_action"
  | "token_earned"
  | "token_spent";

interface LeaderRow {
  rank: number;
  identityId: string;
  displayName: string;
  score: number;
  breakdown: Partial<Record<SignalType, number>>;
}

interface ApiResponse {
  ok: true;
  scope: "session" | "window";
  sessionId: string | null;
  windowMs: number;
  leaderboard: LeaderRow[];
}

const SIGNAL_LABEL: Record<SignalType, string> = {
  command_fired: "commands",
  event_fired: "events",
  social_action: "social",
  token_earned: "tokens earned",
  token_spent: "tokens spent",
};

function formatBreakdown(
  byType: Partial<Record<SignalType, number>>,
): string {
  const order: SignalType[] = [
    "command_fired",
    "event_fired",
    "social_action",
    "token_earned",
    "token_spent",
  ];
  const parts: string[] = [];
  for (const t of order) {
    const v = byType[t];
    if (typeof v === "number" && v > 0) {
      parts.push(`${SIGNAL_LABEL[t]}: ${v}`);
    }
  }
  return parts.join(" · ");
}

export function EngagementTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [noCommunity, setNoCommunity] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setRefreshing(true);
    try {
      const res = await fetch("/api/account/engagement-leaderboard", {
        cache: "no-store",
      });
      if (res.status === 404) {
        setNoCommunity(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Load failed (${res.status}).`);
        return;
      }
      setData(body as ApiResponse);
      setNoCommunity(false);
    } catch {
      setLoadError("Network error while loading.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (noCommunity) {
    return (
      <div className="account-card">
        <h2 className="account-tab__heading">Engagement</h2>
        <Alert variant="info">
          Connect Twitch on{" "}
          <a href="/account?tab=integrations">Account → Integrations</a>{" "}
          to start your community. Once it&rsquo;s set up, the
          engagement leaderboard will surface here.
        </Alert>
      </div>
    );
  }

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
          <h2 className="account-tab__heading">Engagement</h2>
          <p className="account-tab__intro" style={{ marginTop: 0 }}>
            Who&rsquo;s most engaged in your community right now.{" "}
            {data?.scope === "session"
              ? "Scoped to the active session — fires + commands during this stream."
              : "Off-stream snapshot — covers the last hour of activity."}
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
      ) : data.leaderboard.length === 0 ? (
        <p className="account-tab__empty">
          No engagement signals logged yet. Have someone fire{" "}
          <code>!chaos</code>, <code>!hype</code>, or{" "}
          <code>!hug @friend</code> and they&rsquo;ll show up here.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-12)",
            marginTop: "var(--spacing-16)",
          }}
        >
          {data.leaderboard.map((row) => (
            <Card
              key={row.identityId}
              variant="outlined"
              padding="medium"
            >
              <div
                style={{
                  display: "flex",
                  gap: "var(--spacing-16)",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--font-size-18)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--text-tertiary)",
                    minWidth: "2ch",
                    textAlign: "right",
                  }}
                >
                  {row.rank}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--font-size-16)",
                      fontWeight:
                        "var(--font-weight-semibold)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {row.displayName}
                  </p>
                  <p
                    style={{
                      margin: "var(--spacing-4) 0 0",
                      fontSize: "var(--font-size-12)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {formatBreakdown(row.breakdown) || "—"}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: "var(--font-size-24)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--text-primary)",
                  }}
                >
                  {row.score}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
