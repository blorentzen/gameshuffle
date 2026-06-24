"use client";

/**
 * PlatformModerationTab — staff review queue for reported profiles.
 *
 * Lists open reports with a target summary + a link to the profile, and
 * actions: Dismiss, Clear name, Warn, Suspend (7d), Ban (admin only).
 * Backed by /api/admin/moderation (staff-gated; ban/unban admin-only).
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button } from "@empac/cascadeds";
import { reportReasonLabel } from "@/lib/moderation/reasons";

interface ReviewReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  targetId: string;
  target: {
    username: string | null;
    displayName: string | null;
    moderationStatus: string | null;
    moderationUntil: string | null;
  } | null;
}

interface ReviewAppeal {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  user: { username: string | null; displayName: string | null; moderationStatus: string | null } | null;
}

export function PlatformModerationTab() {
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [appeals, setAppeals] = useState<ReviewAppeal[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/moderation", { cache: "no-store" });
      if (!res.ok) {
        setError("Couldn't load the moderation queue.");
        return;
      }
      const body = (await res.json()) as {
        reports: ReviewReport[];
        appeals: ReviewAppeal[];
        isAdmin: boolean;
      };
      setReports(body.reports);
      setAppeals(body.appeals ?? []);
      setIsAdmin(body.isAdmin);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    report: ReviewReport,
    action: string,
    extra?: Record<string, unknown>,
    confirmMsg?: string,
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(report.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targetUserId: report.targetId,
          reportId: report.id,
          ...extra,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ? `Action failed: ${b.error}` : "Action failed.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function actAppeal(
    appeal: ReviewAppeal,
    action: "grant_appeal" | "deny_appeal",
    confirmMsg?: string,
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(appeal.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, appealId: appeal.id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ? `Action failed: ${b.error}` : "Action failed.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Platform Moderation</h2>
      <p className="account-tab__intro">
        Review reported profiles and take action. Suspensions auto-expire; bans
        are permanent (admin only). Every action is logged.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : reports.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No open reports. 🎉</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
          {reports.map((r) => {
            const name = r.target?.displayName || r.target?.username || r.targetId;
            const disabled = busy === r.id;
            return (
              <div key={r.id} className="mod-report">
                <div className="mod-report__body">
                  <div className="mod-report__head">
                    <strong>{name}</strong>
                    {r.target?.username ? (
                      <a
                        href={`/u/${r.target.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mod-report__link"
                      >
                        @{r.target.username} ↗
                      </a>
                    ) : null}
                    {r.target?.moderationStatus && r.target.moderationStatus !== "ok" ? (
                      <Badge variant="warning" size="small">
                        {r.target.moderationStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mod-report__reason">{reportReasonLabel(r.reason)}</div>
                  {r.details ? <p className="mod-report__details">{r.details}</p> : null}
                  <span className="mod-report__time">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mod-report__actions">
                  <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "dismiss")}>
                    Dismiss
                  </Button>
                  <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "clear_display_name")}>
                    Clear name
                  </Button>
                  <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "clear_bio")}>
                    Clear bio
                  </Button>
                  <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "clear_banner")}>
                    Clear banner
                  </Button>
                  <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "warn")}>
                    Warn
                  </Button>
                  <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "suspend", { durationHours: 168 }, `Suspend ${name} for 7 days?`)}>
                    Suspend 7d
                  </Button>
                  {isAdmin ? (
                    <Button size="small" variant="danger" disabled={disabled} onClick={() => void act(r, "ban", undefined, `Permanently ban ${name}? This hides their profile.`)}>
                      Ban
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && appeals.length > 0 ? (
        <div style={{ marginTop: "var(--spacing-24)" }}>
          <h3 className="account-tab__heading" style={{ fontSize: "var(--font-size-16)" }}>
            Appeals ({appeals.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)", marginTop: "var(--spacing-12)" }}>
            {appeals.map((a) => {
              const name = a.user?.displayName || a.user?.username || a.userId;
              const disabled = busy === a.id;
              return (
                <div key={a.id} className="mod-report">
                  <div className="mod-report__body">
                    <div className="mod-report__head">
                      <strong>{name}</strong>
                      {a.user?.username ? (
                        <a href={`/u/${a.user.username}`} target="_blank" rel="noreferrer" className="mod-report__link">
                          @{a.user.username} ↗
                        </a>
                      ) : null}
                      {a.user?.moderationStatus && a.user.moderationStatus !== "ok" ? (
                        <Badge variant="warning" size="small">
                          {a.user.moderationStatus}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mod-report__details">{a.message}</p>
                    <span className="mod-report__time">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mod-report__actions">
                    {isAdmin ? (
                      <>
                        <Button size="small" variant="primary" disabled={disabled} onClick={() => void actAppeal(a, "grant_appeal", `Grant ${name}'s appeal? This lifts the restriction.`)}>
                          Grant
                        </Button>
                        <Button size="small" variant="secondary" disabled={disabled} onClick={() => void actAppeal(a, "deny_appeal")}>
                          Deny
                        </Button>
                      </>
                    ) : (
                      <span className="mod-report__time">Admin only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
