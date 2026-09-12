"use client";

/**
 * PlatformFlags — staff/admin toggles for platform feature flags
 * (gs_platform_flags). First flag: GS Circuit billing (organizer paid tiers).
 * Reads/writes /api/admin/platform-flags. Rendered inside a Platform Admin tab.
 */

import { useEffect, useState } from "react";
import { Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

interface Flag {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

/** Friendly names for known flag keys (falls back to the key). */
const LABELS: Record<string, string> = {
  organizer_billing_enabled: "GS Circuit billing (organizer paid tiers)",
};

export function PlatformFlags() {
  const toast = useToast();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/platform-flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.flags) setFlags(d.flags as Flag[]);
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: string, enabled: boolean) {
    setBusy(key);
    setFlags((f) => f.map((x) => (x.key === key ? { ...x, enabled } : x)));
    try {
      const res = await fetch("/api/admin/platform-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      if (res.ok) toast.success("Flag updated");
      else throw new Error();
    } catch {
      toast.error("Couldn't update flag");
      setFlags((f) => f.map((x) => (x.key === key ? { ...x, enabled: !enabled } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Feature flags</h2>
      <p className="account-tab__intro">
        Platform-wide switches. Changes take effect within ~30 seconds (cached).
      </p>
      {loading ? (
        <p className="account-tab__empty">Loading…</p>
      ) : flags.length === 0 ? (
        <p className="account-tab__empty">No flags yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          {flags.map((f) => (
            <li
              key={f.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--spacing-16)",
                padding: "var(--spacing-12) var(--spacing-16)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--gs-radius-md, 1.2rem)",
                background: "var(--surface-default)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{LABELS[f.key] ?? f.key}</div>
                {f.description && (
                  <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>{f.description}</div>
                )}
              </div>
              <Switch checked={f.enabled} disabled={busy === f.key} onChange={(e) => void toggle(f.key, e.target.checked)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
