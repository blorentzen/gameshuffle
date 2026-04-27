"use client";

/**
 * Module-state scenarios — picks/bans config UI + mid-flow snapshot.
 * Renders a fixture-only preview of the module surface from
 * ModulesSection without depending on the live session_modules row.
 */

import { Alert, Badge, Card, Switch } from "@empac/cascadeds";
import type { ModuleFixture, ScenarioFixture } from "../types";

export function ModulesView({ fixture }: { fixture: ScenarioFixture }) {
  if (fixture.kind !== "module") {
    return <Alert variant="error">ModulesView received unsupported fixture kind <code>{fixture.kind}</code>.</Alert>;
  }
  return <ModuleScenario fixture={fixture} />;
}

function ModuleScenario({ fixture }: { fixture: ModuleFixture }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      <Card variant="outlined" padding="medium">
        <h2 style={{ marginTop: 0 }}>Feature modules</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: 0 }}>
          Live session: <strong>{fixture.activeSession.name}</strong> · game{" "}
          <code>{(fixture.activeSession.config as { game?: string }).game ?? "—"}</code>
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          {fixture.modules.map((m) => {
            const state = m.state as {
              status?: string;
              picks?: Array<{ user: string; value: string }>;
              bans?: Array<{ user: string; value: string }>;
              timer_started_at?: string | null;
              locked_at?: string | null;
            };
            return (
              <li
                key={m.module_id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--spacing-8)",
                  padding: "var(--spacing-12)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-6)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
                  <strong>{moduleLabel(m.module_id)}</strong>
                  <ModuleStatusBadge status={state?.status} enabled={m.enabled} />
                  <Switch checked={m.enabled} onChange={() => {}} />
                </div>
                {fixture.focus === "config" && (
                  <pre
                    style={{
                      margin: 0,
                      padding: "var(--spacing-8)",
                      background: "var(--background-secondary)",
                      borderRadius: "var(--radius-4)",
                      fontSize: "var(--font-size-12)",
                      color: "var(--text-secondary)",
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(m.config, null, 2)}
                  </pre>
                )}
                {fixture.focus === "mid_flow" && (state?.picks || state?.bans) && (
                  <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                    {state.picks && (
                      <div>
                        <strong>Picks ({state.picks.length}):</strong>{" "}
                        {state.picks.map((p) => `${p.user}→${p.value}`).join(", ") || "(none yet)"}
                      </div>
                    )}
                    {state.bans && (
                      <div>
                        <strong>Bans ({state.bans.length}):</strong>{" "}
                        {state.bans.map((p) => `${p.user}→${p.value}`).join(", ") || "(none yet)"}
                      </div>
                    )}
                    {state.timer_started_at && (
                      <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "var(--spacing-4)" }}>
                        Timer started {new Date(state.timer_started_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function moduleLabel(id: string): string {
  if (id === "picks") return "Picks";
  if (id === "bans") return "Bans";
  if (id === "kart_randomizer") return "Kart randomizer";
  return id;
}

function ModuleStatusBadge({ status, enabled }: { status?: string; enabled: boolean }) {
  if (!enabled) return <Badge variant="default" size="small">Disabled</Badge>;
  if (status === "collecting") return <Badge variant="info" size="small">Collecting</Badge>;
  if (status === "locked") return <Badge variant="error" size="small">Locked</Badge>;
  if (status === "completed") return <Badge variant="success" size="small">Completed</Badge>;
  return <Badge variant="success" size="small">Enabled</Badge>;
}
