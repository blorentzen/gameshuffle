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
import { Button } from "@empac/cascadeds";
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
        <p style={{ color: "#9a2f2c", fontSize: "14px", margin: 0 }}>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="account-card">
        <h2>Sign-in Methods</h2>
        <p style={{ color: "#808080", fontSize: "14px", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  const linkedOauth = data.connections.filter((c) => c.isLinked);
  const totalMethods = (data.hasPassword ? 1 : 0) + linkedOauth.length;

  return (
    <div className="account-card">
      <h2>Sign-in Methods</h2>
      <p style={{ color: "#606060", fontSize: "14px", marginTop: 0, marginBottom: "1.25rem" }}>
        Active ways to log into GameShuffle. To add or remove an OAuth provider, head to{" "}
        <a
          href="/account?tab=profile"
          onClick={(e) => {
            e.preventDefault();
            router.push("/account?tab=profile");
          }}
          style={{ color: "#0E75C1", fontWeight: 600 }}
        >
          Profile → Connections
        </a>
        .
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {/* Password */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            border: "1px solid #e2e5ea",
            borderRadius: "0.5rem",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "#202020" }}>Email &amp; password</div>
            <div style={{ fontSize: "13px", color: "#606060", marginTop: "0.15rem" }}>{data.email ?? "—"}</div>
          </div>
          <div>
            {data.hasPassword ? (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "999px",
                  background: "#e6f7ee",
                  color: "#1a7c45",
                  border: "1px solid #b7e4c7",
                }}
              >
                Active
              </span>
            ) : (
              <span style={{ fontSize: "13px", color: "#856404" }}>Not set — use the password card below</span>
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
              padding: "0.75rem 1rem",
              border: "1px solid #e2e5ea",
              borderRadius: "0.5rem",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "#202020" }}>{PROVIDER_LABEL[c.provider]}</div>
              <div style={{ fontSize: "13px", color: "#606060", marginTop: "0.15rem" }}>
                {c.externalDisplayName ?? c.externalUsername ?? "Linked"}
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "0.2rem 0.55rem",
                borderRadius: "999px",
                background: "#e6f7ee",
                color: "#1a7c45",
                border: "1px solid #b7e4c7",
              }}
            >
              Active
            </span>
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
              padding: "0.75rem 1rem",
              border: "1px dashed #d0d4d9",
              borderRadius: "0.5rem",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "#606060" }}>{PROVIDER_LABEL[c.provider]}</div>
              <div style={{ fontSize: "13px", color: "#808080", marginTop: "0.15rem" }}>Not linked</div>
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

      <p style={{ color: "#808080", fontSize: "12px", marginTop: "1rem", marginBottom: 0 }}>
        {totalMethods <= 1
          ? "You only have one active sign-in method. Add a password or link another provider in Connections before disconnecting."
          : `${totalMethods} active sign-in methods.`}
      </p>
    </div>
  );
}
