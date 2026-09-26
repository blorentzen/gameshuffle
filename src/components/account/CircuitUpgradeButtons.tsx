"use client";

/**
 * Subscribe-to-Circuit controls for the Plans tab: a monthly/annual toggle and a
 * button per paid tier (Circuit 64 / Circuit 256). POSTs to
 * /api/stripe/circuit/checkout and redirects to Stripe's hosted Checkout.
 */

import { useState } from "react";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { Button } from "@empac/cascadeds";
import { CIRCUIT_SUBSCRIPTION_TIERS } from "@/lib/tournaments/circuit";

export function CircuitUpgradeButtons({ onError }: { onError?: (message: string) => void }) {
  const pricing = usePublicPricing();
  const [annual, setAnnual] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const checkout = async (tier: "circuit_64" | "circuit_256") => {
    setWorking(tier);
    try {
      const res = await fetch("/api/stripe/circuit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: annual ? "annual" : "monthly" }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        onError?.(body.error || body.message || res.statusText || "Couldn't start checkout.");
        setWorking(null);
        return;
      }
      window.location.assign(body.url);
    } catch (err) {
      console.error("[circuit-upgrade] checkout error:", err);
      onError?.("Couldn't start checkout (network error).");
      setWorking(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
      <div style={{ display: "inline-flex", alignSelf: "flex-start", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" }}>
        {([["Monthly", false], ["Annual", true]] as const).map(([label, val]) => (
          <button
            key={label}
            type="button"
            onClick={() => setAnnual(val)}
            style={{
              padding: "var(--spacing-6) var(--spacing-16)", fontSize: "var(--font-size-14)", fontWeight: 600, border: "none", cursor: "pointer",
              background: annual === val ? "var(--bg-primary, var(--primary-500))" : "transparent",
              color: annual === val ? "var(--text-on-primary, #fff)" : "var(--text-secondary)",
            }}
          >
            {label}{label === "Annual" ? " · save ~2 mo" : ""}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        {CIRCUIT_SUBSCRIPTION_TIERS.map((t) => {
          const live = pricing.plans[t.id];
          const price = live && (annual ? live.annual : live.monthly) != null ? (annual ? `${usd(live.annual)}/yr` : `${usd(live.monthly)}/mo`) : t.price !== null && t.price !== "quoted" ? (annual ? `$${t.price.annualUsd}/yr` : `$${t.price.monthlyUsd}/mo`) : "";
          return (
            <Button key={t.id} variant={t.id === "circuit_64" ? "primary" : "secondary"} disabled={working !== null} onClick={() => checkout(t.id as "circuit_64" | "circuit_256")}>
              {working === t.id ? "Redirecting…" : `${t.displayName} · ${price}`}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
