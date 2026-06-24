"use client";

/**
 * Manage the accounts you've blocked (account → Security). Lists them with
 * an unblock action. Backed by /api/account/blocks.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";

interface Blocked {
  userId: string;
  username: string | null;
  displayName: string | null;
  createdAt: string;
}

export function BlockedUsersManager() {
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/blocks", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { blocked: Blocked[] };
        setBlocked(body.blocked);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(userId: string) {
    setBusy(userId);
    try {
      const res = await fetch(
        `/api/account/blocks?blockedUserId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Blocked accounts</h2>
      <p className="account-tab__intro">
        Accounts you&rsquo;ve blocked. You won&rsquo;t see each other&rsquo;s profiles.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : blocked.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>You haven&rsquo;t blocked anyone.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
          {blocked.map((b) => (
            <div key={b.userId} className="blocked-row">
              <div>
                <strong>{b.displayName || b.username || "User"}</strong>
                {b.username ? (
                  <span style={{ color: "var(--text-tertiary)" }}> @{b.username}</span>
                ) : null}
              </div>
              <Button
                size="small"
                variant="secondary"
                disabled={busy === b.userId}
                onClick={() => void unblock(b.userId)}
              >
                Unblock
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
