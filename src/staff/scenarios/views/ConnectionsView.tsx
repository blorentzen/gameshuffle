"use client";

/**
 * Renders connection-state scenarios — Twitch / Discord / Stripe billing
 * cards as they'd appear on /account → Integrations and /account → Plans.
 *
 * Phase 1 implementation deliberately avoids importing the real
 * IntegrationCard / TwitchHubTab / PlansTab components since those
 * components currently fetch their own data. Phase 2 of this work (or
 * follow-up commit) splits those components into presentational variants
 * that fixtures can render directly. For now, the view recreates the
 * relevant CDS-styled chrome from scratch — visual fidelity is high
 * because everything uses the same CDS tokens.
 */

import { Alert, Badge, Button, Card } from "@empac/cascadeds";
import type {
  BillingFixture,
  ConnectionFixture,
  ScenarioFixture,
} from "../types";

export function ConnectionsView({ fixture }: { fixture: ScenarioFixture }) {
  if (fixture.kind === "connection") return <ConnectionScenario fixture={fixture} />;
  if (fixture.kind === "billing") return <BillingScenario fixture={fixture} />;
  return <UnsupportedFixtureKind kind={fixture.kind} />;
}

function ConnectionScenario({ fixture }: { fixture: ConnectionFixture }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      <TwitchCard fixture={fixture} />
      <DiscordCard fixture={fixture} />
    </div>
  );
}

function TwitchCard({ fixture }: { fixture: ConnectionFixture }) {
  const c = fixture.twitch;
  if (!c) {
    return (
      <Card variant="outlined" padding="medium">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)" }}>
          <h2 style={{ margin: 0 }}>Twitch</h2>
          <Badge variant="default" size="small">Not connected</Badge>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: 0, marginBottom: "var(--spacing-16)" }}>
          Link your Twitch account to use streamer-integration features.
        </p>
        <Button variant="primary">Connect Twitch</Button>
      </Card>
    );
  }

  const enabledSubs = c.eventsub_subs.filter((s) => s.status === "enabled").length;
  const total = c.eventsub_subs.length;

  return (
    <Card variant="outlined" padding="medium">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Twitch</h2>
        {fixture.warningOverride === "connecting" && <Badge variant="info" size="small">Connecting…</Badge>}
        {fixture.warningOverride === "token_expiring" && <Badge variant="warning" size="small">Token expiring</Badge>}
        {fixture.warningOverride === "bot_not_authorized" && <Badge variant="warning" size="small">Bot consent missing</Badge>}
        {!fixture.warningOverride && <Badge variant="success" size="small">Connected</Badge>}
      </div>

      {fixture.warningOverride === "token_expiring" && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="warning">
            Twitch access token refreshes within the next 5 minutes. The bot may briefly drop chat events during the refresh window.
          </Alert>
        </div>
      )}
      {fixture.warningOverride === "bot_not_authorized" && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="warning">
            Bot chat permission missing. Reconnect Twitch and grant <strong>channel:bot</strong> when prompted.
          </Alert>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "var(--spacing-8)", columnGap: "var(--spacing-16)", fontSize: "var(--font-size-14)" }}>
        <span style={{ color: "var(--text-tertiary)" }}>Account</span>
        <span style={{ color: "var(--text-primary)" }}>
          {c.twitch_display_name}{" "}
          <span style={{ color: "var(--text-tertiary)" }}>@{c.twitch_login}</span>
        </span>

        <span style={{ color: "var(--text-tertiary)" }}>EventSub</span>
        <span>
          <Badge variant={enabledSubs === total ? "success" : "warning"} size="small">
            {enabledSubs} of {total} subscriptions active
          </Badge>
        </span>

        <span style={{ color: "var(--text-tertiary)" }}>Bot authorized</span>
        <span>{c.bot_authorized ? "Yes" : "No"}</span>

        <span style={{ color: "var(--text-tertiary)" }}>Public lobby</span>
        <span>{c.public_lobby_enabled ? "Enabled" : "Disabled"}</span>

        <span style={{ color: "var(--text-tertiary)" }}>Channel points</span>
        <span>{c.channel_points_enabled ? `Enabled — ${c.channel_point_cost} pts` : "Disabled"}</span>
      </div>

      <div style={{ marginTop: "var(--spacing-16)", display: "flex", gap: "var(--spacing-8)" }}>
        <Button variant="secondary" size="small">Sync subscriptions</Button>
        <Button variant="danger" size="small">Disconnect</Button>
      </div>
    </Card>
  );
}

function DiscordCard({ fixture }: { fixture: ConnectionFixture }) {
  const c = fixture.discord;
  if (!c) {
    return (
      <Card variant="outlined" padding="medium">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)" }}>
          <h2 style={{ margin: 0 }}>Discord</h2>
          <Badge variant="default" size="small">Not connected</Badge>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: 0, marginBottom: "var(--spacing-16)" }}>
          Link Discord to enable bot commands and slash-command integration.
        </p>
        <Button variant="primary">Connect Discord</Button>
      </Card>
    );
  }
  return (
    <Card variant="outlined" padding="medium">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Discord</h2>
        <Badge variant="success" size="small">Connected</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "var(--spacing-8)", columnGap: "var(--spacing-16)", fontSize: "var(--font-size-14)" }}>
        <span style={{ color: "var(--text-tertiary)" }}>Account</span>
        <span>{c.discord_global_name ?? c.discord_username}</span>

        <span style={{ color: "var(--text-tertiary)" }}>Bot in servers</span>
        <span>
          {c.bot_in_servers.length === 0
            ? "None"
            : c.bot_in_servers.map((s) => s.server_name).join(", ")}
        </span>
      </div>
      <div style={{ marginTop: "var(--spacing-16)", display: "flex", gap: "var(--spacing-8)" }}>
        <Button variant="danger" size="small">Disconnect</Button>
      </div>
    </Card>
  );
}

function BillingScenario({ fixture }: { fixture: BillingFixture }) {
  const b = fixture.billing;
  return (
    <Card variant="outlined" padding="medium">
      <h2 style={{ marginTop: 0 }}>Plan</h2>
      {b.status === "none" && (
        <>
          <Badge variant="default" size="small">Free</Badge>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-12)" }}>
            You&apos;re on the Free plan. Pro unlocks the streamer integration, modules, and overlay.
          </p>
          <Button variant="primary">{b.has_used_trial ? "Subscribe to Pro" : "Start 14-day trial"}</Button>
        </>
      )}
      {b.status === "trialing" && (
        <>
          <Badge variant="info" size="small">Pro — Trial</Badge>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-12)" }}>
            Trial ends {b.trial_ends_at ? new Date(b.trial_ends_at).toLocaleDateString() : "soon"}.
            Cancel anytime before then to avoid being charged.
          </p>
          <Button variant="secondary">Manage Subscription</Button>
        </>
      )}
      {b.status === "active" && (
        <>
          <Badge variant="success" size="small">Pro — Active</Badge>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-12)" }}>
            Renews {b.current_period_end ? new Date(b.current_period_end).toLocaleDateString() : "monthly"}.
            {b.cancel_at_period_end ? " Cancellation scheduled." : ""}
          </p>
          <Button variant="secondary">Manage Subscription</Button>
        </>
      )}
      {b.status === "past_due" && (
        <>
          <div style={{ marginBottom: "var(--spacing-12)" }}>
            <Alert variant="error">Payment failed. We&apos;ll retry over the next two weeks; update your payment method to fix it now.</Alert>
          </div>
          <Badge variant="error" size="small">Pro — Past Due</Badge>
          <div style={{ marginTop: "var(--spacing-12)" }}>
            <Button variant="primary">Update Payment Method</Button>
          </div>
        </>
      )}
      {b.status === "canceled" && (
        <>
          <Badge variant="default" size="small">Pro — Cancelled</Badge>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-12)" }}>
            Your Pro access ends {b.current_period_end ? new Date(b.current_period_end).toLocaleDateString() : "at the end of the period"}.
          </p>
          <Button variant="primary">Resubscribe</Button>
        </>
      )}
    </Card>
  );
}

function UnsupportedFixtureKind({ kind }: { kind: string }) {
  return (
    <Alert variant="error">ConnectionsView received fixture kind <code>{kind}</code> — wrong view registered.</Alert>
  );
}
