"use client";

/**
 * Shared upgrade-to-Pro button row. Used by:
 *   - PlansTab (billing surface)
 *   - TwitchHubTab (Free-tier upsell at the tier-gate moment)
 *   - (future) Discord Hub, YouTube / Kick coming-soon cards once those
 *     ship real connect flows
 *
 * Copy adapts to trial eligibility (`hasUsedTrial` → skip trial pitch).
 * Clicks POST to `/api/stripe/checkout` and redirect to Stripe's hosted
 * Checkout; the router never mounts a paywall UI on our side.
 *
 * Outside the US (paid plans are US-only for now) the buttons become a
 * waitlist signup, including when checkout itself answers "us_only". They stay
 * hidden (space kept) until the country is known, so nobody outside the US sees
 * them flash. Accounts that already have GS Pro get "You have GS Pro" and a
 * link to their plan instead, as does a checkout that answers "already_pro".
 */

import { useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { EVENTS, track } from "@/lib/analytics/events";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";

interface ProUpgradeCtaButtonsProps {
  /** If true, the user has already consumed a trial — skip the trial copy and go straight to paid. Omit to look it up. */
  hasUsedTrial?: boolean;
  /** Error text shown inline on checkout failure (network, missing env, etc.). */
  onError?: (message: string) => void;
  /** Short place name for analytics (Upgrade Clicked `from`). */
  from?: string;
  /** One button, monthly (walls: the yearly price lives on /gs-pro and in Plans & billing). */
  single?: boolean;
  /** Shown on the same row after the button(s), like a "See what's included" link. */
  after?: React.ReactNode;
}

export function ProUpgradeCtaButtons({ hasUsedTrial: given, onError, from = "plans", single = false, after }: ProUpgradeCtaButtonsProps) {
  // Pages that don't know (the marketing /gs-pro page) let the buttons look it up, so nobody is offered a trial they already used.
  const looked = useTrialEligibility();
  const hasUsedTrial = given ?? looked?.hasUsedTrial ?? false;
  const pricing = usePublicPricing();
  const pro = pricing.plans.pro ?? { monthly: 9, annual: 99 };
  const save = pro.monthly && pro.annual ? Math.round((1 - pro.annual / (pro.monthly * 12)) * 100) : null;
  const [working, setWorking] = useState(false);
  const availability = usePaidAvailability();
  const [usOnly, setUsOnly] = useState(false);
  const [already, setAlready] = useState(false);

  const checkout = async (interval: "monthly" | "annual") => {
    setWorking(true);
    track(EVENTS.upgradeClicked, { from });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const body = await res.json();
      if (body.error === "us_only") { setUsOnly(true); setWorking(false); return; }
      if (body.error === "already_pro") { setAlready(true); setWorking(false); return; }
      if (!res.ok || !body.url) {
        onError?.(body.error || body.message || res.statusText || "Couldn't start checkout.");
        setWorking(false);
        return;
      }
      track(EVENTS.checkoutStarted, { plan: `pro-${interval}` });
      window.location.assign(body.url);
    } catch (err) {
      console.error("[pro-upgrade] checkout error:", err);
      onError?.("Couldn't start checkout (network error).");
      setWorking(false);
    }
  };

  if (usOnly || (availability && !availability.paidPlans.available)) return <PaidPlansWaitlist product="pro" />;
  if (already || looked?.isPro) {
    return (
      <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
        You have GS Pro. <Link href="/account?tab=plans">Manage your plan</Link>
      </p>
    );
  }

  const ready = !!availability;
  return (
    <div style={{ display: "flex", gap: "var(--spacing-12)", flexWrap: "wrap", alignItems: "center", visibility: ready ? undefined : "hidden" }} aria-hidden={ready ? undefined : true}>
      <Button
        variant="primary"
        onClick={() => checkout("monthly")}
        disabled={working}
      >
        {working ? "Redirecting…" : single ? (hasUsedTrial ? `Get GS Pro · ${usd(pro.monthly)} a month` : "Start free trial") : hasUsedTrial ? `${usd(pro.monthly)} / month` : `Start trial · ${usd(pro.monthly)} / mo after`}
      </Button>
      {!single && (
        <Button
          variant="secondary"
          onClick={() => checkout("annual")}
          disabled={working}
        >
          {working ? "Redirecting…" : hasUsedTrial ? `${usd(pro.annual)} / year` : `Start trial · ${usd(pro.annual)} / yr after${save ? ` (save ~${save}%)` : ""}`}
        </Button>
      )}
      {after}
    </div>
  );
}
