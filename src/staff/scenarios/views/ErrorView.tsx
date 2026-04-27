"use client";

/**
 * Error-state scenarios — the empty/retry/reconnect surfaces components
 * fall back to when their data path fails. Captures the "graceful
 * degradation" treatment.
 */

import { Alert, Button, Card } from "@empac/cascadeds";
import type { ErrorFixture, ScenarioFixture } from "../types";

export function ErrorView({ fixture }: { fixture: ScenarioFixture }) {
  if (fixture.kind !== "error") {
    return <Alert variant="error">ErrorView received unsupported fixture kind <code>{fixture.kind}</code>.</Alert>;
  }
  return <ErrorScenario fixture={fixture} />;
}

function ErrorScenario({ fixture }: { fixture: ErrorFixture }) {
  if (fixture.errorType === "rls_denied") {
    return (
      <Card variant="outlined" padding="medium">
        <h2 style={{ marginTop: 0 }}>Sessions</h2>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", marginTop: 0 }}>
          You don&apos;t have any sessions yet. Start a test session from the Twitch Hub or go live in a supported game.
        </p>
        <Button variant="primary">Open Twitch Hub</Button>
      </Card>
    );
  }
  if (fixture.errorType === "network_failure") {
    return (
      <Card variant="outlined" padding="medium">
        <h2 style={{ marginTop: 0 }}>Connection Status</h2>
        <Alert variant="error">
          {fixture.errorMessage ?? "Couldn't reach the server. Check your connection and try again."}
        </Alert>
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <Button variant="primary">Retry</Button>
        </div>
      </Card>
    );
  }
  // stale_data
  return (
    <Card variant="outlined" padding="medium">
      <h2 style={{ marginTop: 0 }}>Twitch</h2>
      <Alert variant="warning">
        Your Twitch token expired. Reconnect to resume bot chat and EventSub events.
      </Alert>
      <div style={{ marginTop: "var(--spacing-16)", display: "flex", gap: "var(--spacing-8)" }}>
        <Button variant="primary">Reconnect Twitch</Button>
        <Button variant="ghost">Disconnect</Button>
      </div>
    </Card>
  );
}
