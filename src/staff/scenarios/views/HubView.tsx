"use client";

/**
 * Hub state scenarios — forward-looking. Hub UI ships in Phase 4
 * (gs-pro-v1-architecture.md §10). Until that lands, scenarios in the
 * Sessions category render this placeholder, which displays the fixture
 * data in a structured "what the Hub would render" preview using CDS
 * primitives. When Phase 4 ships the real Hub component, replace this
 * view's contents with a real <HubView fixture={...} /> render.
 */

import { Alert, Badge, Card } from "@empac/cascadeds";
import type { HubFixture, ScenarioFixture } from "../types";

export function HubView({ fixture }: { fixture: ScenarioFixture }) {
  if (fixture.kind !== "hub") {
    return <Alert variant="error">HubView received unsupported fixture kind <code>{fixture.kind}</code>.</Alert>;
  }
  return <HubScenario fixture={fixture} />;
}

function HubScenario({ fixture }: { fixture: HubFixture }) {
  const session = fixture.activeSession;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      <div>
        <Alert variant="info">
          <strong>Phase 4 Hub UI placeholder.</strong> Real Hub component arrives in Phase 4 of the Pro v1 build.
          This view renders the fixture data in a structured preview so visual evaluation of session-state design
          (badges, counts, layouts) can happen against the right data shapes before the production component lands.
        </Alert>
      </div>

      <Card variant="outlined" padding="medium">
        <h2 style={{ marginTop: 0 }}>Active Session</h2>
        {session ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap", marginBottom: "var(--spacing-12)" }}>
              <strong style={{ fontSize: "var(--font-size-16)" }}>{session.name}</strong>
              <SessionStatusBadge status={session.status} />
              {(session.feature_flags as Record<string, unknown>)?.test_session ? (
                <Badge variant="warning" size="small">Test session</Badge>
              ) : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "var(--spacing-6)", columnGap: "var(--spacing-16)", fontSize: "var(--font-size-14)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Slug</span>
              <span><code>{session.slug}</code></span>
              <span style={{ color: "var(--text-tertiary)" }}>Activated</span>
              <span>{session.activated_at ? new Date(session.activated_at).toLocaleString() : "—"}</span>
              {session.ended_at ? (
                <>
                  <span style={{ color: "var(--text-tertiary)" }}>Ended</span>
                  <span>{new Date(session.ended_at).toLocaleString()}</span>
                </>
              ) : null}
              <span style={{ color: "var(--text-tertiary)" }}>Game</span>
              <span><code>{(session.config as { game?: string }).game ?? "—"}</code></span>
              <span style={{ color: "var(--text-tertiary)" }}>Participants</span>
              <span>{fixture.participants?.length ?? 0}</span>
            </div>
          </>
        ) : (
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>
            No active session. {fixture.hubFocus === "idle" ? "Idle Hub view." : ""}
          </p>
        )}
      </Card>

      {fixture.participants && fixture.participants.length > 0 && (
        <Card variant="outlined" padding="medium">
          <h3 style={{ marginTop: 0, fontSize: "var(--font-size-16)" }}>Participants ({fixture.participants.length})</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            {fixture.participants.map((p) => (
              <li key={p.id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
                <span style={{ fontWeight: p.is_broadcaster ? "var(--font-weight-semibold)" : "var(--font-weight-regular)" }}>
                  {p.display_name}
                </span>
                {p.is_broadcaster && <Badge variant="info" size="small">Broadcaster</Badge>}
                <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>
                  via {p.platform} · joined {new Date(p.joined_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {fixture.recentEvents && fixture.recentEvents.length > 0 && (
        <Card variant="outlined" padding="medium">
          <h3 style={{ marginTop: 0, fontSize: "var(--font-size-16)" }}>Recent shuffles</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            {fixture.recentEvents.map((e) => {
              const parts = [e.combo.character?.name, e.combo.vehicle?.name, e.combo.wheels?.name, e.combo.glider?.name]
                .filter(Boolean);
              return (
                <li key={e.id} style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
                  <span style={{ fontWeight: "var(--font-weight-semibold)", color: e.is_broadcaster ? "var(--primary-600)" : "var(--text-primary)" }}>
                    {e.display_name}
                  </span>
                  {" — "}
                  {parts.join(" · ")}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {fixture.scheduledSessions && fixture.scheduledSessions.length > 0 && (
        <Card variant="outlined" padding="medium">
          <h3 style={{ marginTop: 0, fontSize: "var(--font-size-16)" }}>Scheduled / Draft</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            {fixture.scheduledSessions.map((s) => (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
                <strong>{s.name}</strong>
                <SessionStatusBadge status={s.status} />
                <code style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>{s.slug}</code>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {fixture.endedSessions && fixture.endedSessions.length > 0 && (
        <Card variant="flat" padding="medium">
          <h3 style={{ marginTop: 0, fontSize: "var(--font-size-16)" }}>Recent history</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            {fixture.endedSessions.map((s) => (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                <span>{s.name}</span>
                <SessionStatusBadge status={s.status} />
                {s.ended_at && <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>ended {new Date(s.ended_at).toLocaleString()}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const variant: "success" | "warning" | "error" | "default" | "info" =
    status === "active"
      ? "success"
      : status === "ending"
        ? "warning"
        : status === "ended"
          ? "default"
          : status === "cancelled"
            ? "error"
            : status === "scheduled" || status === "ready"
              ? "info"
              : "default";
  return <Badge variant={variant} size="small">{status}</Badge>;
}
