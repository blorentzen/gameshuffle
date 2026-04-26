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
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";

interface ProUpgradeCtaButtonsProps {
  /** If true, the user has already consumed a trial — skip the trial copy and go straight to paid. */
  hasUsedTrial: boolean;
  /** Error text shown inline on checkout failure (network, missing env, etc.). */
  onError?: (message: string) => void;
}

export function ProUpgradeCtaButtons({ hasUsedTrial, onError }: ProUpgradeCtaButtonsProps) {
  const [working, setWorking] = useState(false);

  const checkout = async (interval: "monthly" | "annual") => {
    setWorking(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        onError?.(body.error || body.message || res.statusText || "Couldn't start checkout.");
        setWorking(false);
        return;
      }
      window.location.assign(body.url);
    } catch (err) {
      console.error("[pro-upgrade] checkout error:", err);
      onError?.("Couldn't start checkout (network error).");
      setWorking(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
      <Button
        variant="primary"
        onClick={() => checkout("monthly")}
        disabled={working}
      >
        {working ? "Redirecting…" : hasUsedTrial ? "$9 / month" : "Start trial · $9 / mo after"}
      </Button>
      <Button
        variant="secondary"
        onClick={() => checkout("annual")}
        disabled={working}
      >
        {working ? "Redirecting…" : hasUsedTrial ? "$99 / year" : "Start trial · $99 / yr after (save ~8%)"}
      </Button>
    </div>
  );
}
