"use client";

/**
 * Plans tab on /account. Resolves live subscription state from our
 * `subscriptions` table (populated by Stripe webhooks) and renders the
 * appropriate state card:
 *
 *   Staff        → "Staff (Pro access)" note, no billing actions
 *   Pro active   → Plan label + renewal date + Manage Billing
 *   Pro trialing → Trial end date + Manage Billing
 *   Pro ending   → cancel_at_period_end = true, "Access through {date}"
 *   Pro past_due → Payment failure banner + Manage Billing
 *   Free         → Start 14-day Pro trial / Go Pro (monthly vs annual)
 *
 * Checkout + portal flows are handled via the /api/stripe/* endpoints,
 * which return a URL for the browser to follow to Stripe's hosted pages.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isStaffRole } from "@/lib/subscription";
import { ProUpgradeCtaButtons } from "./ProUpgradeCtaButtons";
import { BillingManager } from "./BillingManager";
import { circuitTier as getCircuitTier, type CircuitTierId } from "@/lib/tournaments/circuit";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { PRO_HIGHLIGHTS, CIRCUIT_HIGHLIGHTS, FREE_VS_PRO } from "@/lib/plans/highlights";
import { HighlightGroups, LimitsTable } from "./plans/PlanHighlights";
import { CircuitTierLadder } from "./plans/CircuitTierLadder";

interface SubscriptionRow {
  status: string;
  tier: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
}

interface UserBillingRow {
  role: string | null;
  has_used_trial: boolean;
  stripe_customer_id: string | null;
  circuit_tier: string | null;
  circuit_status: string | null;
}

type BillingStatus =
  | "loading"
  | "staff"
  | "pro_trialing"
  | "pro_active"
  | "pro_ending"
  | "pro_past_due"
  | "free";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}


export function PlansTab() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [billingStatus, setBillingStatus] = useState<BillingStatus>("loading");
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [userRow, setUserRow] = useState<UserBillingRow | null>(null);
  const [portalWorking, setPortalWorking] = useState(false);
  const pricing = usePublicPricing();
  const [annual, setAnnual] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  // Organizer billing is still in preview. The ladder must say so rather than
  // offering paid buttons the marketing page contradicts.
  const [billingEnabled, setBillingEnabled] = useState(false);
  // Initial flash reflects the ?checkout=success/canceled query param Stripe
  // bounces us back with. Read once at mount (lazy initializer) so we don't
  // need an effect that would trigger the "setState in effect" lint.
  const [flashMessage, setFlashMessage] = useState<
    | { kind: "success" | "info" | "error"; text: string }
    | null
  >(() => {
    const checkout = searchParams.get("checkout") || searchParams.get("circuit_checkout");
    if (checkout === "success") {
      return {
        kind: "success",
        text: "Checkout complete. Your subscription should appear within a few seconds once Stripe finishes processing.",
      };
    }
    if (checkout === "canceled") {
      return { kind: "info", text: "Checkout canceled. No charge made." };
    }
    return null;
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [subRes, userRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("status, tier, price_id, current_period_end, cancel_at_period_end, trial_end")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("users")
          .select("role, has_used_trial, stripe_customer_id, circuit_tier, circuit_status")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const sub = (subRes.data as SubscriptionRow | null) ?? null;
      const u = (userRes.data as UserBillingRow | null) ?? null;
      setSubscription(sub);
      setUserRow(u);
      setBillingStatus(resolveBillingStatus(sub, u));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tournaments/billing-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setBillingEnabled(!!j.billingEnabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!user || billingStatus === "loading") {
    return (
      <div className="account-card">
        <p>Loading…</p>
      </div>
    );
  }

  const handlePortal = async () => {
    setPortalWorking(true);
    setFlashMessage(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.url) {
        setFlashMessage({
          kind: "error",
          text: `Couldn't open billing portal: ${body.error || body.message || res.statusText}`,
        });
        setPortalWorking(false);
        return;
      }
      window.location.assign(body.url);
    } catch (err) {
      console.error(err);
      setFlashMessage({
        kind: "error",
        text: "Couldn't open billing portal (network error).",
      });
      setPortalWorking(false);
    }
  };

  const subscribeCircuit = async (tier: "circuit_64" | "circuit_256") => {
    setBusyTier(tier);
    try {
      const res = await fetch("/api/stripe/circuit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: annual ? "annual" : "monthly" }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        setFlashMessage({ kind: "error", text: body.error || body.message || res.statusText || "Couldn't start checkout." });
        setBusyTier(null);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setFlashMessage({ kind: "error", text: "Couldn't start checkout (network error)." });
      setBusyTier(null);
    }
  };

  const onError = (msg: string) => setFlashMessage({ kind: "error", text: msg });
  const pro = describeProPlan(billingStatus, subscription);
  const circuit = describeCircuitPlan(userRow);
  const proPrice = pricing.plans.pro ?? { monthly: 9, annual: 99 };
  const proSave =
    proPrice.monthly && proPrice.annual
      ? Math.round((1 - proPrice.annual / (proPrice.monthly * 12)) * 100)
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
      {flashMessage && (
        <Alert
          variant={flashMessage.kind === "success" ? "success" : flashMessage.kind === "error" ? "error" : "info"}
          onClose={() => setFlashMessage(null)}
        >
          {flashMessage.text}
        </Alert>
      )}

      {/* GameShuffle Pro */}
      <PlanCard
        name="GameShuffle Pro"
        subtitle="For streamers — turn your game night into an interactive show."
        status={pro.status}
        rows={pro.rows}
        alert={pro.alert}
        learnMore={{ href: "/gs-pro", label: "Learn more about GameShuffle Pro" }}
      >
        {pro.free ? (
          <>
            <p className="plan-price">
              {usd(proPrice.monthly)}
              <span className="plan-price__per">/month</span>
              {proPrice.annual != null && (
                <span className="plan-price__alt">
                  or {usd(proPrice.annual)}/year{proSave ? ` — save about ${proSave}%` : ""}
                </span>
              )}
            </p>
            <ProUpgradeCtaButtons hasUsedTrial={!!userRow?.has_used_trial} onError={onError} />
            <p style={mutedNote}>Payments by Stripe. Switch monthly/annual anytime in the billing portal.</p>

            <h4 className="plan-section-heading">What Pro unlocks</h4>
            <HighlightGroups groups={PRO_HIGHLIGHTS} />

            <h4 className="plan-section-heading">Where the free plan stops</h4>
            <LimitsTable rows={FREE_VS_PRO} currentIsFree />
          </>
        ) : (
          <>
            <Button variant={pro.reactivate ? "primary" : "secondary"} onClick={handlePortal} disabled={portalWorking}>
              {portalWorking ? "Opening…" : pro.reactivate ? "Reactivate / Manage billing" : "Manage billing"}
            </Button>
            {/* Shown outright, not behind a disclosure. A subscriber should be
                able to see what they are paying for without opening anything —
                half of this list is a feature they may not know they have. */}
            <h4 className="plan-section-heading">Everything included in Pro</h4>
            <HighlightGroups groups={PRO_HIGHLIGHTS} />
          </>
        )}
      </PlanCard>

      {/* GameShuffle Circuit */}
      <PlanCard
        name="GameShuffle Circuit"
        subtitle="For organizers — run bigger tournaments at any scale."
        status={circuit.status}
        learnMore={{ href: "/gs-circuit", label: "Learn more about GameShuffle Circuit" }}
      >
        {circuit.subscribed ? (
          <>
            <Button variant="secondary" onClick={handlePortal} disabled={portalWorking}>
              {portalWorking ? "Opening…" : "Manage billing"}
            </Button>
            <h4 className="plan-section-heading">What your plan includes</h4>
            <HighlightGroups groups={CIRCUIT_HIGHLIGHTS} />
          </>
        ) : (
          <>
            <h4 className="plan-section-heading">Pick the tier that fits your field</h4>
            <CircuitTierLadder
              pricing={pricing}
              annual={annual}
              onAnnualChange={setAnnual}
              currentTier={(userRow?.circuit_tier as CircuitTierId | null) ?? "free"}
              billingEnabled={billingEnabled}
              busyTier={busyTier}
              onSubscribe={subscribeCircuit}
            />
            <h4 className="plan-section-heading">What a paid tier adds</h4>
            <HighlightGroups groups={CIRCUIT_HIGHLIGHTS} />
            <p style={mutedNote}>Payments by Stripe. A separate subscription from GameShuffle Pro.</p>
          </>
        )}
      </PlanCard>

      {/* In-app plan changes (upgrade/downgrade/add-on/cancel) for accounts that
          hold a paid plan. Renders nothing for free accounts or staff. */}
      <BillingManager />

    </div>
  );
}

const mutedNote: React.CSSProperties = { color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-12)", marginBottom: 0 };

type PillTone = "active" | "trial" | "warn" | "muted";
interface PlanStatus { label: string; tone: PillTone; }
interface PlanDesc { status: PlanStatus; rows: { label: string; value: string }[]; alert?: string; free?: boolean; reactivate?: boolean; subscribed?: boolean; }

function describeProPlan(billingStatus: BillingStatus, sub: SubscriptionRow | null): PlanDesc {
  switch (billingStatus) {
    case "staff":
      return { status: { label: "Staff (Pro access)", tone: "active" }, rows: [] };
    case "pro_trialing":
      return { status: { label: "Trial active", tone: "trial" }, rows: sub?.trial_end ? [{ label: "Trial ends", value: formatDate(sub.trial_end) }] : [] };
    case "pro_active":
      return { status: { label: "Active", tone: "active" }, rows: sub?.current_period_end ? [{ label: "Renews", value: formatDate(sub.current_period_end) }] : [] };
    case "pro_ending":
      return { status: { label: "Canceling", tone: "warn" }, rows: sub?.current_period_end ? [{ label: "Access through", value: formatDate(sub.current_period_end) }] : [], reactivate: true };
    case "pro_past_due":
      return { status: { label: "Past due", tone: "warn" }, rows: [], alert: "Payment failed. Pro access continues during Stripe's retry window — update your card to avoid interruption." };
    default:
      return { status: { label: "Free", tone: "muted" }, rows: [], free: true };
  }
}

function describeCircuitPlan(u: UserBillingRow | null): PlanDesc {
  if (isStaffRole(u?.role ?? null)) {
    return { status: { label: "Staff (Circuit access)", tone: "active" }, rows: [], subscribed: true };
  }
  const active = !!u?.circuit_status && ["active", "trialing", "past_due"].includes(u.circuit_status);
  if (active && u?.circuit_tier) {
    const tier = getCircuitTier(u.circuit_tier as never);
    const tone: PillTone = u.circuit_status === "past_due" ? "warn" : "active";
    return { status: { label: `${tier.displayName}${u.circuit_status === "past_due" ? " · past due" : ""}`, tone }, rows: [], subscribed: true };
  }
  return { status: { label: "Not subscribed", tone: "muted" }, rows: [], subscribed: false };
}

function StatusPill({ status }: { status: PlanStatus }) {
  const bg: Record<PillTone, string> = {
    active: "color-mix(in srgb, var(--success-500, #16a34a) 16%, var(--surface-default))",
    trial: "color-mix(in srgb, var(--primary-500) 16%, var(--surface-default))",
    warn: "color-mix(in srgb, var(--warning-500, #d97706) 18%, var(--surface-default))",
    muted: "var(--background-secondary)",
  };
  const fg: Record<PillTone, string> = {
    active: "var(--success-700, #15803d)",
    trial: "var(--primary-700, var(--primary-600))",
    warn: "var(--warning-700, #b45309)",
    muted: "var(--text-tertiary)",
  };
  return (
    <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: 999, background: bg[status.tone], color: fg[status.tone], whiteSpace: "nowrap" }}>
      {status.label}
    </span>
  );
}

function PlanCard({ name, subtitle, status, rows, alert, learnMore, children }: { name: string; subtitle: string; status: PlanStatus; rows?: { label: string; value: string }[]; alert?: string; learnMore?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: "var(--font-size-18)", fontWeight: 700, margin: 0 }}>{name}</h3>
          <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", margin: "var(--spacing-4) 0 0", maxWidth: "34rem" }}>{subtitle}</p>
        </div>
        <StatusPill status={status} />
      </div>

      {alert && <div style={{ marginTop: "var(--spacing-12)" }}><Alert variant="error">{alert}</Alert></div>}

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)", marginTop: "var(--spacing-12)" }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", fontSize: "var(--font-size-14)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>{r.label}</span>
              <span style={{ fontWeight: 600 }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {children && <div style={{ marginTop: "var(--spacing-16)" }}>{children}</div>}

      {learnMore && (
        <div style={{ marginTop: "var(--spacing-12)" }}>
          <a href={learnMore.href} style={{ fontSize: "var(--font-size-14)", fontWeight: 600, color: "var(--bg-primary, var(--primary-600))", textDecoration: "none" }}>{learnMore.label} →</a>
        </div>
      )}
    </Card>
  );
}

function resolveBillingStatus(
  sub: SubscriptionRow | null,
  u: UserBillingRow | null
): BillingStatus {
  if (isStaffRole(u?.role ?? null)) return "staff";
  if (!sub) return "free";
  if (sub.status === "trialing") return "pro_trialing";
  if (sub.status === "past_due") return "pro_past_due";
  if (sub.status === "active") {
    return sub.cancel_at_period_end ? "pro_ending" : "pro_active";
  }
  // canceled / incomplete_expired / unpaid / incomplete
  return "free";
}

