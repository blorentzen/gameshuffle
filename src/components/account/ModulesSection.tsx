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
import { Button, Switch } from "@empac/cascadeds";
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
        <p style={{ color: "#808080", fontSize: "14px", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="account-card">
        <h2>Modules</h2>
        <p style={{ color: "#9a2f2c", fontSize: "14px", margin: 0 }}>{error ?? "Couldn't load modules."}</p>
      </div>
    );
  }

  if (!data.session) {
    return (
      <div className="account-card">
        <h2>Modules</h2>
        <p style={{ color: "#606060", fontSize: "14px", margin: 0 }}>
          Modules become configurable once you have a live or test session running. Start one from the section above.
        </p>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2>Modules</h2>
      <p style={{ color: "#606060", fontSize: "14px", marginBottom: "1rem" }}>
        Toggle and run feature modules for this session. Module state lives on the active session — ending the session
        resets everything.
      </p>
      {error && (
        <div
          style={{
            background: "#fff5f5",
            border: "1px solid #f5c2c0",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            color: "#9a2f2c",
            fontSize: "13px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
        border: "1px solid #e2e5ea",
        borderRadius: "0.6rem",
        padding: "1rem",
        background: m.enabled ? "#fff" : "#fafbfc",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>{m.displayName}</h3>
            {isPicksOrBans && status && <StatusBadge status={status} />}
          </div>
          <p style={{ color: "#606060", fontSize: "13px", margin: "0.25rem 0 0", lineHeight: 1.5 }}>{m.description}</p>
          {m.chatCommands.length > 0 && (
            <p style={{ color: "#909090", fontSize: "12px", margin: "0.5rem 0 0", lineHeight: 1.4 }}>
              Chat: {m.chatCommands.map((c) => `!gs-${c}`).join(" · ")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
          <Button variant="ghost" size="small" onClick={() => setConfigOpen(true)} disabled={busy}>
            Configure
          </Button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Switch checked={m.enabled} onChange={() => onToggle(!m.enabled)} />
            <span style={{ fontSize: "13px", color: m.enabled ? "#155724" : "#808080", fontWeight: 500 }}>
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
            marginTop: "0.85rem",
            paddingTop: "0.75rem",
            borderTop: "1px dashed #e2e5ea",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "13px", color: "#404040" }}>
            <strong>{participantCount}</strong> participant{participantCount === 1 ? "" : "s"} ·{" "}
            <strong>{totalSelections}</strong> total {m.id === "picks" ? "pick" : "ban"}
            {totalSelections === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
  const palette: Record<string, { bg: string; fg: string }> = {
    collecting: { bg: "#eef4fb", fg: "#1f4f82" },
    locked: { bg: "#fff5f5", fg: "#9a2f2c" },
    completed: { bg: "#e6f7ee", fg: "#155724" },
  };
  const p = palette[status] ?? { bg: "#f1f4f7", fg: "#404040" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.5rem",
        background: p.bg,
        color: p.fg,
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}
