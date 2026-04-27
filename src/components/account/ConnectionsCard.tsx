"use client";

/**
 * Connections card — single source of truth for linking/unlinking
 * external OAuth providers (Discord, Twitch today; YouTube/Kick later).
 *
 * Per gs-connections-architecture.md §3 + §4. The Sign-in Methods
 * section on Security and the Integrations tab cards both READ from
 * the same `/api/account/connections` endpoint this card uses, so the
 * three surfaces stay in sync without prop-drilling.
 *
 * Connect path: client-side `supabase.auth.linkIdentity({ provider })`
 * — Supabase returns a redirect URL we follow to start the OAuth flow.
 * The /auth/callback route already handles the new identity + caches
 * the avatar URL on `users.{discord,twitch}_avatar`.
 *
 * Disconnect path: POST /api/account/connections/disconnect — the
 * server-side route fires the streamer-integration teardown for Twitch,
 * resets avatar_source if needed, and removes the auth identity.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

interface ConnectionRoles {
  signIn: boolean;
  profileDisplay: boolean;
  streamerIntegration: boolean;
}

interface Connection {
  provider: "discord" | "twitch";
  isLinked: boolean;
  externalUsername: string | null;
  externalDisplayName: string | null;
  externalAvatarUrl: string | null;
  roles: ConnectionRoles;
  canDisconnect: boolean;
}

interface ConnectionsViewResponse {
  ok: true;
  hasPassword: boolean;
  email: string | null;
  connections: Connection[];
}

const PROVIDER_LABELS: Record<string, string> = {
  discord: "Discord",
  twitch: "Twitch",
};

const PROVIDER_ICONS: Record<string, string> = {
  discord: "/images/icons/discord.svg",
  twitch: "/images/icons/twitch.svg",
};

function rolesSummary(c: Connection): string {
  const parts: string[] = [];
  if (c.roles.signIn) parts.push("sign-in");
  if (c.roles.profileDisplay) parts.push("profile avatar");
  if (c.roles.streamerIntegration) parts.push("streamer integration");
  if (parts.length === 0) return "Linked but no active uses yet.";
  return `Used for: ${parts.join(", ")}.`;
}

export function ConnectionsCard() {
  const [data, setData] = useState<ConnectionsViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/connections");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to load connections.");
        setData(null);
      } else {
        setError(null);
        setData(body as ConnectionsViewResponse);
      }
    } catch (err) {
      console.error("[ConnectionsCard] load failed:", err);
      setError("Network error loading connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConnect = async (provider: "discord" | "twitch") => {
    setBusyProvider(provider);
    setError(null);
    try {
      const supabase = createClient();
      // linkIdentity initiates the OAuth flow as an additive identity link
      // for the currently signed-in user (vs. signInWithOAuth which expects
      // an unauthenticated session). On success the browser redirects to
      // the provider; the auth/callback handler picks it up.
      //
      // IMPORTANT: redirectTo is matched against the Supabase project's
      // Authentication → URL Configuration → Redirect URLs allowlist on
      // the SERVER (not our Twitch app's allowlist — that's a different
      // OAuth chain used only by /api/twitch/auth/start). When the value
      // doesn't match, Supabase silently falls back to the project's
      // "Site URL" (production), which is the most common cause of
      // "I'm on localhost but Twitch sent me back to prod."
      //
      // We use the bare /auth/callback path (no query string) to match
      // the same shape as the login + signup OAuth flows, which are known
      // to work. Use the `?redirect=` param the existing callback already
      // honors so the user lands on Profile after the link completes.
      const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/account?tab=profile")}`;
      const { data: linkRes, error: linkErr } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo },
      });
      if (linkErr) {
        setError(linkErr.message || `Couldn't start ${PROVIDER_LABELS[provider]} link.`);
        setBusyProvider(null);
        return;
      }
      // Defensive logging so it's obvious in the dev console which URL
      // Supabase generated — useful when diagnosing redirect_mismatch
      // bouncing the user to prod despite localhost env vars.
      if (linkRes?.url) {
        console.log("[ConnectionsCard] linkIdentity URL:", linkRes.url, "redirectTo sent:", redirectTo);
        window.location.assign(linkRes.url);
      }
    } catch (err) {
      console.error("[ConnectionsCard] linkIdentity failed:", err);
      setError("Couldn't start the link flow.");
      setBusyProvider(null);
    }
  };

  const handleDisconnect = async (provider: "discord" | "twitch") => {
    if (!confirm(`Disconnect ${PROVIDER_LABELS[provider]}? This removes it as a sign-in method and tears down any active integration.`)) {
      return;
    }
    setBusyProvider(provider);
    setError(null);
    try {
      const res = await fetch("/api/account/connections/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || body.error || "Disconnect failed.");
      } else {
        // Notify the rest of the app — navbar, avatar picker, etc — that
        // connection state changed so they can re-fetch.
        window.dispatchEvent(new CustomEvent("gs:connections-changed"));
      }
    } catch (err) {
      console.error("[ConnectionsCard] disconnect failed:", err);
      setError("Network error during disconnect.");
    } finally {
      setBusyProvider(null);
      await refresh();
    }
  };

  if (loading && !data) {
    return (
      <div className="account-card">
        <h2>Connections</h2>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="account-card">
        <h2>Connections</h2>
        <Alert variant="error">{error ?? "Couldn't load connections."}</Alert>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2>Connections</h2>
      <p style={{ marginBottom: "var(--spacing-12)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
        Link external accounts to use them for sign-in, profile display, and (with a Pro plan) streamer integrations.
      </p>

      {error && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
        {data.connections.map((c) => (
          <div
            key={c.provider}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--spacing-12)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-8)",
              padding: "var(--spacing-12) var(--spacing-16)",
              background: c.isLinked ? "var(--background-primary)" : "var(--background-secondary)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flex: 1, minWidth: 0 }}>
              <img
                src={PROVIDER_ICONS[c.provider]}
                alt=""
                style={{ width: 28, height: 28, flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-6)" }}>
                  <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-16)" }}>{PROVIDER_LABELS[c.provider]}</span>
                  {c.isLinked ? (
                    <Badge variant="success" size="small">Linked</Badge>
                  ) : (
                    <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Not connected</span>
                  )}
                </div>
                {c.isLinked && (
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)", margin: "var(--spacing-4) 0 0", lineHeight: "var(--line-height-snug)" }}>
                    {c.externalDisplayName || c.externalUsername || "(no display name)"} · {rolesSummary(c)}
                  </p>
                )}
              </div>
            </div>

            <div style={{ flexShrink: 0 }}>
              {c.isLinked ? (
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => handleDisconnect(c.provider)}
                  disabled={busyProvider === c.provider || !c.canDisconnect}
                  title={!c.canDisconnect ? "Set a password or link another provider before disconnecting." : undefined}
                >
                  {busyProvider === c.provider ? "Working…" : "Disconnect"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => handleConnect(c.provider)}
                  disabled={busyProvider === c.provider}
                >
                  {busyProvider === c.provider ? "Redirecting…" : "Connect"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!data.hasPassword && data.connections.some((c) => c.isLinked) && (
        <div style={{ marginTop: "var(--spacing-12)" }}>
          <Alert variant="warning">
            You don&apos;t have a password set yet. Set one under Security so you can keep signing in if you ever disconnect your only OAuth provider.
          </Alert>
        </div>
      )}
    </div>
  );
}
