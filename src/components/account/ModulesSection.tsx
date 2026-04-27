"use client";

/**
 * Modules section inside TwitchHubTab.
 *
 * Lists every available feature module with a streamer-facing toggle,
 * status (for picks/bans), and quick-action controls (lock/unlock,
 * reset). Lives alongside the connection-status / overlay / channel-points
 * cards in the Hub.
 *
 * Per gs-feature-modules-picks-bans.md §2 ("Module rendering in the GS Hub").
 *
 * Talks to the `/api/twitch/modules` endpoint for everything — never imports
 * server-only modules so the component can stay client-side.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Switch } from "@empac/cascadeds";
import { ModuleConfigModal } from "./ModuleConfigModal";

interface PicksOrBansState {
  status?: "collecting" | "locked" | "completed";
  picks_by_participant?: Record<string, Record<string, string[]>>;
  bans_by_participant?: Record<string, Record<string, string[]>>;
  locked_at?: string | null;
}

interface ModuleRow {
  id: "kart_randomizer" | "picks" | "bans";
  displayName: string;
  description: string;
  requiredTier: string;
  chatCommands: string[];
  enabled: boolean;
  provisioned: boolean;
  config: Record<string, unknown>;
  state: PicksOrBansState | null;
  updatedAt: string | null;
}

interface ModulesPayload {
  session: { id: string; status: string; randomizerSlug: string | null } | null;
  modules: ModuleRow[];
}

export function ModulesSection() {
  const [data, setData] = useState<ModulesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyModule, setBusyModule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/twitch/modules");
      const body = (await res.json()) as ModulesPayload | { error: string };
      if (!res.ok) {
        setError("error" in body ? body.error : "Failed to load modules.");
        setData(null);
      } else {
        setError(null);
        setData(body as ModulesPayload);
      }
    } catch (err) {
      console.error("[ModulesSection] load failed:", err);
      setError("Network error loading modules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setBusyModule((body.moduleId as string) ?? null);
      try {
        const res = await fetch("/api/twitch/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(result.message || result.error || "Action failed.");
          return false;
        }
        setError(null);
        return true;
      } catch (err) {
        console.error("[ModulesSection] action failed:", err);
        setError("Network error.");
        return false;
      } finally {
        setBusyModule(null);
      }
    },
    []
  );

  const handleToggle = async (moduleId: string, enabled: boolean) => {
    const ok = await post({ action: "set_enabled", moduleId, enabled });
    if (ok) await refresh();
  };

  const handleStatusChange = async (moduleId: string, status: string) => {
    const ok = await post({ action: "set_status", moduleId, status });
    if (ok) await refresh();
  };

  const handleResetState = async (moduleId: string) => {
    if (!confirm(`Reset all ${moduleId} for this session? This clears every participant's selections.`)) return;
    const initial =
      moduleId === "picks"
        ? { status: "collecting", picks_by_participant: {}, timer_started_at: null, locked_at: null }
        : { status: "collecting", bans_by_participant: {}, timer_started_at: null, locked_at: null };
    const ok = await post({ action: "set_state", moduleId, state: initial });
    if (ok) await refresh();
  };

  if (loading && !data) {
    return (
      <div className="account-card">
        <h2>Modules</h2>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="account-card">
        <h2>Modules</h2>
        <Alert variant="error">{error ?? "Couldn't load modules."}</Alert>
      </div>
    );
  }

  if (!data.session) {
    return (
      <div className="account-card">
        <h2>Modules</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
          Modules become configurable once you have a live or test session running. Start one from the section above.
        </p>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2>Modules</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-12)" }}>
        Toggle and run feature modules for this session. Module state lives on the active session — ending the session
        resets everything.
      </p>
      {error && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
        {data.modules.map((m) => (
          <ModuleCard
            key={m.id}
            module={m}
            busy={busyModule === m.id}
            onToggle={(enabled) => handleToggle(m.id, enabled)}
            onStatusChange={(status) => handleStatusChange(m.id, status)}
            onReset={() => handleResetState(m.id)}
            onConfigured={() => void refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  module: m,
  busy,
  onToggle,
  onStatusChange,
  onReset,
  onConfigured,
}: {
  module: ModuleRow;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onStatusChange: (status: string) => void;
  onReset: () => void;
  onConfigured: () => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const isPicksOrBans = m.id === "picks" || m.id === "bans";
  const status = m.state?.status ?? null;
  const participantsMap =
    m.id === "picks" ? m.state?.picks_by_participant : m.id === "bans" ? m.state?.bans_by_participant : null;
  const participantCount = participantsMap ? Object.keys(participantsMap).length : 0;
  const totalSelections = participantsMap
    ? Object.values(participantsMap).reduce(
        (acc, perCat) =>
          acc + Object.values(perCat ?? {}).reduce((sum, arr) => sum + (arr?.length ?? 0), 0),
        0
      )
    : 0;

  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-8)",
        padding: "var(--spacing-12)",
        background: m.enabled ? "var(--background-primary)" : "var(--background-secondary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--spacing-12)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-6)" }}>
            <h3 style={{ fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-semibold)", margin: 0 }}>{m.displayName}</h3>
            {isPicksOrBans && status && <StatusBadge status={status} />}
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "var(--spacing-4) 0 0", lineHeight: "var(--line-height-snug)" }}>{m.description}</p>
          {m.chatCommands.length > 0 && (
            <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", margin: "var(--spacing-6) 0 0", lineHeight: "var(--line-height-snug)" }}>
              Chat: {m.chatCommands.map((c) => `!gs-${c}`).join(" · ")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexShrink: 0 }}>
          <Button variant="ghost" size="small" onClick={() => setConfigOpen(true)} disabled={busy}>
            Configure
          </Button>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-6)" }}>
            <Switch checked={m.enabled} onChange={() => onToggle(!m.enabled)} />
            <span style={{ fontSize: "var(--font-size-14)", color: m.enabled ? "var(--success-700)" : "var(--text-tertiary)", fontWeight: "var(--font-weight-medium)" }}>
              {m.enabled ? "On" : "Off"}
            </span>
          </div>
        </div>
      </div>

      <ModuleConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        moduleId={m.id}
        moduleName={m.displayName}
        initialConfig={m.config}
        onSaved={onConfigured}
      />

      {isPicksOrBans && m.enabled && (
        <div
          style={{
            marginTop: "var(--spacing-12)",
            paddingTop: "var(--spacing-12)",
            borderTop: "1px dashed var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--spacing-12)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
            <strong>{participantCount}</strong> participant{participantCount === 1 ? "" : "s"} ·{" "}
            <strong>{totalSelections}</strong> total {m.id === "picks" ? "pick" : "ban"}
            {totalSelections === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: "var(--spacing-6)", flexWrap: "wrap" }}>
            {status === "collecting" && (
              <Button variant="primary" onClick={() => onStatusChange("locked")} disabled={busy}>
                Lock {m.id}
              </Button>
            )}
            {status === "locked" && (
              <>
                <Button variant="secondary" onClick={() => onStatusChange("completed")} disabled={busy}>
                  Mark complete
                </Button>
                <Button variant="ghost" onClick={() => onStatusChange("collecting")} disabled={busy}>
                  Reopen
                </Button>
              </>
            )}
            {status === "completed" && (
              <Button variant="ghost" onClick={() => onStatusChange("collecting")} disabled={busy}>
                Reopen
              </Button>
            )}
            <Button variant="ghost" onClick={onReset} disabled={busy}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // Map collecting/locked/completed to CDS Badge variants.
  const variant: "info" | "error" | "success" | "default" =
    status === "collecting" ? "info" : status === "locked" ? "error" : status === "completed" ? "success" : "default";
  return (
    <Badge variant={variant} size="small">
      {status}
    </Badge>
  );
}
