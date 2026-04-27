"use client";

/**
 * Read-only sign-in methods summary on the Security tab.
 *
 * Per gs-connections-architecture.md §5.3 — under the Connections-as-
 * source-of-truth model, this section becomes informational only:
 *
 *   - Shows whether the user has a password set
 *   - Lists every linked OAuth provider as an active sign-in method
 *   - Calls out unlinked providers with "Link in Profile → Connections"
 *
 * Connect / disconnect controls live exclusively on the Connections card
 * (Profile tab). Removing the duplicate buttons here eliminates the
 * "I clicked the wrong Connect button" failure mode.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Button } from "@empac/cascadeds";
import { useRouter } from "next/navigation";

interface ConnectionRow {
  provider: "discord" | "twitch";
  isLinked: boolean;
  externalUsername: string | null;
  externalDisplayName: string | null;
}

interface ConnectionsResponse {
  ok: true;
  hasPassword: boolean;
  email: string | null;
  connections: ConnectionRow[];
}

const PROVIDER_LABEL: Record<string, string> = {
  discord: "Discord",
  twitch: "Twitch",
};

export function SignInMethodsSection() {
  const router = useRouter();
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/account/connections", { cache: "no-store" });
        if (!res.ok) {
          setError(`Couldn't load sign-in methods (${res.status}).`);
          return;
        }
        const body = (await res.json()) as ConnectionsResponse;
        if (cancelled) return;
        setData(body);
      } catch (err) {
        console.error("[SignInMethodsSection] load failed:", err);
        if (!cancelled) setError("Couldn't load sign-in methods.");
      }
    };
    load();
    // Refresh when a connect/disconnect happens elsewhere on the page.
    const onChange = () => void load();
    window.addEventListener("gs:connections-changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("gs:connections-changed", onChange);
    };
  }, []);

  if (error) {
    return (
      <div className="account-card">
        <h2>Sign-in Methods</h2>
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="account-card">
        <h2>Sign-in Methods</h2>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  const linkedOauth = data.connections.filter((c) => c.isLinked);
  const totalMethods = (data.hasPassword ? 1 : 0) + linkedOauth.length;

  return (
    <div className="account-card">
      <h2>Sign-in Methods</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: 0, marginBottom: "var(--spacing-16)" }}>
        Active ways to log into GameShuffle. To add or remove an OAuth provider, head to{" "}
        <a
          href="/account?tab=profile"
          onClick={(e) => {
            e.preventDefault();
            router.push("/account?tab=profile");
          }}
          style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}
        >
          Profile → Connections
        </a>
        .
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
        {/* Password */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--spacing-12) var(--spacing-16)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-8)",
            gap: "var(--spacing-12)",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)", color: "var(--text-primary)" }}>Email &amp; password</div>
            <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginTop: "var(--spacing-2)" }}>{data.email ?? "—"}</div>
          </div>
          <div>
            {data.hasPassword ? (
              <Badge variant="success" size="small">Active</Badge>
            ) : (
              <span style={{ fontSize: "var(--font-size-14)", color: "var(--warning-700)" }}>Not set — use the password card below</span>
            )}
          </div>
        </div>

        {/* Linked OAuth providers */}
        {linkedOauth.map((c) => (
          <div
            key={c.provider}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--spacing-12) var(--spacing-16)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-8)",
              gap: "var(--spacing-12)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)", color: "var(--text-primary)" }}>{PROVIDER_LABEL[c.provider]}</div>
              <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginTop: "var(--spacing-2)" }}>
                {c.externalDisplayName ?? c.externalUsername ?? "Linked"}
              </div>
            </div>
            <Badge variant="success" size="small">Active</Badge>
          </div>
        ))}

        {/* Unlinked providers — point to Connections */}
        {data.connections.filter((c) => !c.isLinked).map((c) => (
          <div
            key={c.provider}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--spacing-12) var(--spacing-16)",
              border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-8)",
              gap: "var(--spacing-12)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>{PROVIDER_LABEL[c.provider]}</div>
              <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginTop: "var(--spacing-2)" }}>Not linked</div>
            </div>
            <Button
              variant="secondary"
              size="small"
              onClick={() => router.push("/account?tab=profile")}
            >
              Link in Connections
            </Button>
          </div>
        ))}
      </div>

      <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-12)", marginBottom: 0 }}>
        {totalMethods <= 1
          ? "You only have one active sign-in method. Add a password or link another provider in Connections before disconnecting."
          : `${totalMethods} active sign-in methods.`}
      </p>
    </div>
  );
}
