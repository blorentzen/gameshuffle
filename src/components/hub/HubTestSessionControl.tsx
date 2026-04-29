"use client";

/**
 * Test session controls + detected-category indicator on /hub.
 *
 * Per gs-pro-v1-phase-4a-spec.md (and the C.2 deferred decision): these
 * used to live in TwitchHubTab on /account. They moved here so /account
 * is just integration config + setup, while /hub is the live operations
 * surface.
 *
 * The button is intentionally simple — no Twitch-bot status, no scope
 * negotiation. /account?tab=integrations remains the source of truth for
 * connection state; this component just lets a connected, supported
 * streamer flip the bot on without going live.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@empac/cascadeds";

interface DetectedCategory {
  name: string | null;
  slug: string | null;
  supported: boolean;
}

interface Props {
  /** True if a Twitch connection row exists for the user. */
  hasTwitchConnection: boolean;
  /** True if any session in active/ending/test state already exists. */
  hasActiveSession: boolean;
}

export function HubTestSessionControl({ hasTwitchConnection, hasActiveSession }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedCategory | null>(null);
  const [refreshingCategory, setRefreshingCategory] = useState(false);

  useEffect(() => {
    if (!hasTwitchConnection || hasActiveSession) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/twitch/category/current", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setDetected({
          name: body.categoryName ?? null,
          slug: body.randomizerSlug ?? null,
          supported: !!body.supported,
        });
      } catch {
        // Best-effort — Start endpoint will look up again at click time.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasTwitchConnection, hasActiveSession]);

  const refreshCategory = async () => {
    setRefreshingCategory(true);
    try {
      const res = await fetch("/api/twitch/category/current", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setDetected({
          name: body.categoryName ?? null,
          slug: body.randomizerSlug ?? null,
          supported: !!body.supported,
        });
      }
    } catch {
      // ignore
    }
    setRefreshingCategory(false);
  };

  const startTestSession = async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/twitch/sessions/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Couldn't start test session (${res.status}).`);
        setWorking(false);
        return;
      }
      // New session lands at the top of /hub — refresh so the list re-fetches.
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("[hub] test session start failed", err);
      setError("Couldn't start test session (network error).");
    }
    setWorking(false);
  };

  if (!hasTwitchConnection) return null;
  if (hasActiveSession) return null;

  const disabled = working || pending;

  return (
    <div className="hub-page__test-session">
      <div className="hub-page__test-session-row">
        <div className="hub-page__test-session-copy">
          <h2 className="hub-page__test-session-title">No active session right now</h2>
          <p className="hub-page__test-session-body">
            Go live in a supported game and we&rsquo;ll detect it within seconds, or start a
            test session — the bot will use whatever Twitch category your channel is set to.
          </p>
        </div>
        <Button variant="primary" onClick={startTestSession} disabled={disabled}>
          {working ? "Starting…" : "Start test session"}
        </Button>
      </div>

      {detected && (
        <p className="hub-page__test-session-meta">
          {detected.supported ? (
            <>Twitch category: <strong>{detected.name}</strong> — bot will use the matching randomizer.</>
          ) : detected.name ? (
            <>Twitch category: <strong>{detected.name}</strong> — not supported; bot will reply &ldquo;not supported&rdquo; until you switch to a Mario Kart category.</>
          ) : (
            <>No category set on your Twitch channel — set one before testing.</>
          )}{" "}
          <button
            type="button"
            onClick={refreshCategory}
            disabled={refreshingCategory}
            className="hub-page__test-session-refresh"
          >
            {refreshingCategory ? "Refreshing…" : "Refresh"}
          </button>
        </p>
      )}

      {error && (
        <div className="hub-page__test-session-error">
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}
    </div>
  );
}
