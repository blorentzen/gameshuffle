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
import { Alert, Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isStaffRole } from "@/lib/subscription";
import { ProUpgradeCtaButtons } from "./ProUpgradeCtaButtons";

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

function intervalLabel(priceId: string | null): string {
  if (!priceId) return "";
  // We can't tell monthly vs annual from a bare ID client-side without
  // leaking env vars. Fallback copy stays generic; Stripe's own portal
  // surfaces the precise plan.
  return "";
}

export function PlansTab() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [billingStatus, setBillingStatus] = useState<BillingStatus>("loading");
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [userRow, setUserRow] = useState<UserBillingRow | null>(null);
  const [portalWorking, setPortalWorking] = useState(false);
  // Initial flash reflects the ?checkout=success/canceled query param Stripe
  // bounces us back with. Read once at mount (lazy initializer) so we don't
  // need an effect that would trigger the "setState in effect" lint.
  const [flashMessage, setFlashMessage] = useState<
    | { kind: "success" | "info" | "error"; text: string }
    | null
  >(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      return {
        kind: "success",
        text: "Checkout complete. Your subscription should appear within a few seconds once Stripe finishes processing.",
      };
    }
    if (checkout === "canceled") {
      return { kind: "info", text: "Checkout canceled — no charge made." };
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
          .select("role, has_used_trial, stripe_customer_id")
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

  return (
    <>
      {flashMessage && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert
            variant={flashMessage.kind === "success" ? "success" : flashMessage.kind === "error" ? "error" : "info"}
            onClose={() => setFlashMessage(null)}
          >
            {flashMessage.text}
          </Alert>
        </div>
      )}
      {renderForStatus({
        billingStatus,
        subscription,
        userRow,
        portalWorking,
        onPortal: handlePortal,
        onCheckoutError: (msg) => setFlashMessage({ kind: "error", text: msg }),
      })}
    </>
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

function renderForStatus(args: {
  billingStatus: BillingStatus;
  subscription: SubscriptionRow | null;
  userRow: UserBillingRow | null;
  portalWorking: boolean;
  onPortal: () => void;
  onCheckoutError: (message: string) => void;
}) {
  const { billingStatus, subscription, userRow, portalWorking, onPortal, onCheckoutError } = args;

  switch (billingStatus) {
    case "staff":
      return (
        <>
          <div className="account-card">
            <h2>Plans & Pricing</h2>
            <div className="account-card__row">
              <span className="account-card__label">Current Plan</span>
              <span className="account-card__value">Staff (Pro access)</span>
            </div>
            <p style={{ color: "var(--warning-700)", fontSize: "var(--font-size-14)", marginTop: "0.75rem", marginBottom: 0 }}>
              Internal role — bypasses tier gates for testing without affecting subscription metrics.
            </p>
          </div>
          <FeaturesCard />
        </>
      );

    case "pro_trialing":
      return (
        <>
          <div className="account-card">
            <h2>Plans & Pricing</h2>
            <div className="account-card__row">
              <span className="account-card__label">Current Plan</span>
              <span className="account-card__value">
                Pro — <span style={{ color: "var(--primary-600)" }}>trial active</span>
              </span>
            </div>
            {subscription?.trial_end && (
              <div className="account-card__row">
                <span className="account-card__label">Trial ends</span>
                <span className="account-card__value">{formatDate(subscription.trial_end)}</span>
              </div>
            )}
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-6)" }}>
              Your card on file will be charged when the trial ends unless you cancel.
            </p>
            <div style={{ marginTop: "1rem" }}>
              <Button variant="secondary" onClick={onPortal} disabled={portalWorking}>
                {portalWorking ? "Opening…" : "Manage billing"}
              </Button>
            </div>
          </div>
        </>
      );

    case "pro_active":
      return (
        <>
          <div className="account-card">
            <h2>Plans & Pricing</h2>
            <div className="account-card__row">
              <span className="account-card__label">Current Plan</span>
              <span className="account-card__value">
                Pro{intervalLabel(subscription?.price_id ?? null)}
              </span>
            </div>
            {subscription?.current_period_end && (
              <div className="account-card__row">
                <span className="account-card__label">Renews</span>
                <span className="account-card__value">
                  {formatDate(subscription.current_period_end)}
                </span>
              </div>
            )}
            <div style={{ marginTop: "1rem" }}>
              <Button variant="secondary" onClick={onPortal} disabled={portalWorking}>
                {portalWorking ? "Opening…" : "Manage billing"}
              </Button>
            </div>
          </div>
        </>
      );

    case "pro_ending":
      return (
        <>
          <div className="account-card">
            <h2>Plans & Pricing</h2>
            <div className="account-card__row">
              <span className="account-card__label">Current Plan</span>
              <span className="account-card__value">
                Pro — <span style={{ color: "var(--warning-700)" }}>canceling</span>
              </span>
            </div>
            {subscription?.current_period_end && (
              <div className="account-card__row">
                <span className="account-card__label">Access through</span>
                <span className="account-card__value">
                  {formatDate(subscription.current_period_end)}
                </span>
              </div>
            )}
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-6)" }}>
              Your subscription is set to cancel at the end of the current period. Reactivate
              anytime from the billing portal to keep Pro features active.
            </p>
            <div style={{ marginTop: "1rem" }}>
              <Button variant="primary" onClick={onPortal} disabled={portalWorking}>
                {portalWorking ? "Opening…" : "Reactivate / Manage billing"}
              </Button>
            </div>
          </div>
        </>
      );

    case "pro_past_due":
      return (
        <>
          <div className="account-card">
            <h2>Plans & Pricing</h2>
            <div style={{ marginBottom: "var(--spacing-12)" }}>
              <Alert variant="error">
                Payment failed. Pro access continues during Stripe&rsquo;s retry window —
                update your card to avoid interruption.
              </Alert>
            </div>
            <div className="account-card__row">
              <span className="account-card__label">Current Plan</span>
              <span className="account-card__value">Pro (past due)</span>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <Button variant="primary" onClick={onPortal} disabled={portalWorking}>
                {portalWorking ? "Opening…" : "Update payment method"}
              </Button>
            </div>
          </div>
        </>
      );

    case "free":
    default: {
      const hasUsedTrial = !!userRow?.has_used_trial;
      return (
        <>
          <div className="account-card">
            <h2>Plans & Pricing</h2>
            <div className="account-card__row">
              <span className="account-card__label">Current Plan</span>
              <span className="account-card__value">Free</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: "var(--spacing-12)", marginBottom: 0 }}>
              You&rsquo;re on the Free plan — standalone randomizers stay free forever. Pro
              unlocks Twitch, Discord session binding, feature modules, channel-point
              redemptions, and the OBS overlay.
            </p>
          </div>

          <div className="account-card">
            <h2>{hasUsedTrial ? "Go Pro" : "Start your 14-day Pro trial"}</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-16)" }}>
              {hasUsedTrial
                ? "Welcome back — subscribe anytime. Your card is charged immediately."
                : "Full Pro access for 14 days. Cancel anytime before the trial ends and you won't be charged. Credit card required to start."}
            </p>
            <ProUpgradeCtaButtons hasUsedTrial={hasUsedTrial} onError={onCheckoutError} />
            <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-12)", marginBottom: 0 }}>
              Payments processed by Stripe. Monthly and annual plans can be switched anytime
              from the billing portal.
            </p>
          </div>

          <FeaturesCard />
        </>
      );
    }
  }
}

function FeaturesCard() {
  return (
    <div className="account-card">
      <h2>What Pro unlocks</h2>
      <ul style={{ color: "var(--text-secondary)", paddingLeft: "var(--spacing-16)", lineHeight: "var(--line-height-relaxed)", margin: 0 }}>
        <li>
          <strong>Twitch integration</strong> — bot chat, viewer lobby, <code>!gs-shuffle</code>,
          channel-point redemptions, OBS overlay
        </li>
        <li>
          <strong>Discord session binding</strong> — viewer-side commands alongside Twitch
        </li>
        <li>
          <strong>Feature modules</strong> — Picks, Bans, more coming
        </li>
        <li>
          <strong>Unlimited saved configs + tournaments</strong>
        </li>
      </ul>
    </div>
  );
}
