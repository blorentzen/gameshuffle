"use client";

/**
 * Account-shaped scenarios — Profile/Plans/Security tab snapshots, but
 * this view focuses on the Plans-tab + trial-state surfaces since those
 * are the ones that vary visibly across tier and subscription state.
 */

import { Alert, Badge, Button, Card } from "@empac/cascadeds";
import type { AccountFixture, ScenarioFixture } from "../types";

export function AccountView({ fixture }: { fixture: ScenarioFixture }) {
  if (fixture.kind !== "account") {
    return <Alert variant="error">AccountView received unsupported fixture kind <code>{fixture.kind}</code>.</Alert>;
  }
  return <AccountScenario fixture={fixture} />;
}

function AccountScenario({ fixture }: { fixture: AccountFixture }) {
  const b = fixture.billing;
  const isTrial = b.status === "trialing";
  const trialEndsSoon = isTrial && fixture.trialDay !== undefined && fixture.trialDay >= 11;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      <Card variant="outlined" padding="medium">
        <h2 style={{ marginTop: 0 }}>Profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "var(--spacing-8)", columnGap: "var(--spacing-16)", fontSize: "var(--font-size-14)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Display name</span>
          <span>{fixture.user.display_name}</span>
          <span style={{ color: "var(--text-tertiary)" }}>Email</span>
          <span>{fixture.user.email}</span>
          <span style={{ color: "var(--text-tertiary)" }}>Plan</span>
          <span>
            <PlanBadge tier={fixture.user.tier} status={b.status} />
          </span>
        </div>
      </Card>

      {trialEndsSoon && (
        <Alert variant="warning">
          {fixture.trialDay === 13
            ? "Your Pro trial ends tomorrow — last chance to cancel without being charged."
            : `Your Pro trial ends in ${14 - (fixture.trialDay ?? 0)} days.`}
        </Alert>
      )}

      <Card variant="outlined" padding="medium">
        <h2 style={{ marginTop: 0 }}>Billing</h2>
        <BillingPanel fixture={fixture} />
      </Card>
    </div>
  );
}

function BillingPanel({ fixture }: { fixture: AccountFixture }) {
  const b = fixture.billing;
  if (b.status === "none") {
    return (
      <>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: 0 }}>
          You&apos;re on the Free plan.
        </p>
        <Button variant="primary">{b.has_used_trial ? "Subscribe to Pro" : "Start 14-day trial"}</Button>
      </>
    );
  }
  if (b.status === "trialing") {
    return (
      <>
        <Badge variant="info" size="small">Pro — Trial (day {fixture.trialDay ?? "?"} of 14)</Badge>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "var(--spacing-12) 0" }}>
          Trial ends {b.trial_ends_at ? new Date(b.trial_ends_at).toLocaleDateString() : "soon"}.
        </p>
        <Button variant="secondary">Manage Subscription</Button>
      </>
    );
  }
  if (b.status === "active") {
    return (
      <>
        <Badge variant="success" size="small">Pro — Active</Badge>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "var(--spacing-12) 0" }}>
          Renews {b.current_period_end ? new Date(b.current_period_end).toLocaleDateString() : "monthly"}.
          {b.cancel_at_period_end ? " Cancellation scheduled." : ""}
        </p>
        <Button variant="secondary">Manage Subscription</Button>
      </>
    );
  }
  if (b.status === "past_due") {
    return (
      <>
        <Badge variant="error" size="small">Past Due</Badge>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "var(--spacing-12) 0" }}>
          Payment failed. Update your method to restore Pro access.
        </p>
        <Button variant="primary">Update Payment Method</Button>
      </>
    );
  }
  return (
    <>
      <Badge variant="default" size="small">{b.status}</Badge>
    </>
  );
}

function PlanBadge({ tier, status }: { tier: "free" | "pro" | "pro_plus"; status: string }) {
  if (tier === "free") return <Badge variant="default" size="small">Free</Badge>;
  if (tier === "pro_plus") return <Badge variant="success" size="small">Pro+</Badge>;
  if (status === "trialing") return <Badge variant="info" size="small">Pro Trial</Badge>;
  if (status === "past_due") return <Badge variant="error" size="small">Pro (past due)</Badge>;
  if (status === "canceled") return <Badge variant="default" size="small">Pro (cancelling)</Badge>;
  return <Badge variant="success" size="small">Pro</Badge>;
}
