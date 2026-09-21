"use client";

/**
 * GameShuffle Circuit pricing — styled to match the GS Pro dark pricing module
 * (.pricing-card / .pricing-page__cards, same price format). Sits inside a
 * <DarkBand>. Four tiers + a monthly/annual toggle; "planned" while billing is
 * in preview, real Subscribe buttons once the flag flips on.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@empac/cascadeds";
import { CIRCUIT_TIERS, CIRCUIT_PAID_FEATURES, PRO_ADDON_PRICE, PRO_INCLUDED_ANNUAL_VALUE, type CircuitTier } from "@/lib/tournaments/circuit";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";

const FEATURE_LABEL: Record<(typeof CIRCUIT_PAID_FEATURES)[number], string> = {
  series: "Championship series",
  co_organizers: "Co-organizers",
  branding: "Custom page branding",
  seeding: "Custom seeding & redraw",
  randomizer: "Live randomized rounds",
};

/** The three subscription-style cards; Circuit Events renders as a banner below. */
const CARD_TIERS = CIRCUIT_TIERS.filter((t) => t.id !== "circuit_events");

function capLine(t: CircuitTier): string {
  if (t.playerCap === "lobby") return "One full lobby (12 on MK8DX, 24 on MK World), every format.";
  if (t.playerCap === "override") return "A per-tournament pass sized to your in-person or commercial event.";
  return `Multi-lobby events up to ${t.playerCap} players.`;
}

export function CircuitPricing() {
  const [annual, setAnnual] = useState(false);
  const pricing = usePublicPricing();
  const amounts = (t: CircuitTier) => {
    const live = pricing.plans[t.id];
    if (live && (live.monthly != null || live.annual != null)) return { monthly: live.monthly, annual: live.annual };
    return t.price && t.price !== "quoted" ? { monthly: t.price.monthlyUsd, annual: t.price.annualUsd } : null;
  };
  const addonMonthly = pricing.plans.pro_addon?.monthly ?? PRO_ADDON_PRICE.monthlyUsd;
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tournaments/billing-status")
      .then((r) => r.json())
      .then((j) => setBillingEnabled(!!j.billingEnabled))
      .catch(() => {});
  }, []);

  const subscribe = async (tierId: "circuit_64" | "circuit_256") => {
    setBusyTier(tierId);
    try {
      const res = await fetch("/api/stripe/circuit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierId, interval: annual ? "annual" : "monthly" }),
      });
      if (res.status === 401) { window.location.assign("/login?redirect=/gs-circuit"); return; }
      const j = await res.json().catch(() => ({}));
      if (j.url) window.location.assign(j.url);
      else setBusyTier(null);
    } catch { setBusyTier(null); }
  };

  return (
    <>
      {/* Monthly / annual toggle (styled for the dark band) */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--spacing-24)" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--gray-600, #4b5563)", borderRadius: "0.6rem", overflow: "hidden" }}>
          {([["Monthly", false], ["Annual", true]] as const).map(([label, val]) => (
            <button
              key={label}
              type="button"
              onClick={() => setAnnual(val)}
              style={{
                padding: "var(--spacing-8) var(--spacing-20)", fontSize: "var(--font-size-14)", fontWeight: 600, border: "none", cursor: "pointer",
                background: annual === val ? "var(--primary-500)" : "transparent",
                color: annual === val ? "#fff" : "var(--gray-300, #c2c8d2)",
              }}
            >
              {label}{label === "Annual" ? " · save ~2 mo" : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="circuit-pricing__cards">
        {CARD_TIERS.map((t) => {
          const featured = t.id === "circuit_256";
          const isPaidSub = t.id === "circuit_64" || t.id === "circuit_256";
          // Price presentation matches GS Pro: big price + suffix + subtext.
          let priceBig = "$0";
          let suffix = "";
          let subtext = "Forever free";
          const a = amounts(t);
          if (a) {
            priceBig = annual ? usd(a.annual) : usd(a.monthly);
            suffix = annual ? " /yr" : " /mo";
            subtext = annual ? `${usd(a.monthly)}/mo billed monthly · planned` : `or ${usd(a.annual)}/year · planned`;
          }
          return (
            <Card key={t.id} variant={featured ? "elevated" : "outlined"} padding="large" className={`pricing-card${featured ? " pricing-card--featured" : ""}`}>
              <div className="pricing-card__head">
                <p className="pricing-card__label">{t.displayName}</p>
                <p className="pricing-card__price">{priceBig}{suffix && <span className="pricing-card__price-suffix">{suffix}</span>}</p>
                <p className="pricing-card__price-subtext">{subtext}</p>
                <p className="pricing-card__description">{capLine(t)}</p>

                {isPaidSub && billingEnabled ? (
                  <Button variant={featured ? "primary" : "secondary"} fullWidth loading={busyTier === t.id} onClick={() => subscribe(t.id as "circuit_64" | "circuit_256")}>Subscribe</Button>
                ) : (
                  <Link href="/tournament/create" style={{ textDecoration: "none" }}>
                    <Button variant={featured ? "primary" : "secondary"} fullWidth>
                      {billingEnabled ? "Create a tournament" : "Start free in preview"}
                    </Button>
                  </Link>
                )}
              </div>

              <div className="pricing-card__included">
                <p className="pricing-card__included-title">What&rsquo;s included</p>
                {t.paidFeatures ? (
                  <ul className="pricing-card__list">
                    {t.id === "circuit_256" && (
                      <li>
                        <strong>GameShuffle Pro included</strong> — overlays, chat commands, and
                        channel-point rewards (${PRO_INCLUDED_ANNUAL_VALUE}/yr value)
                      </li>
                    )}
                    {CIRCUIT_PAID_FEATURES.map((f) => <li key={f}>{FEATURE_LABEL[f]}</li>)}
                    {t.id === "circuit_64" && (
                      <li>Add GameShuffle Pro for {usd(addonMonthly)}/mo</li>
                    )}
                  </ul>
                ) : (
                  <ul className="pricing-card__list">
                    <li>Every format &amp; the whole scoring toolkit</li>
                    <li>Live scoring + public join page</li>
                  </ul>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Circuit Events — full-width invoiced-tier banner below the three cards. */}
      <div className="circuit-events-banner">
        <div className="circuit-events-banner__copy">
          <p className="circuit-events-banner__label">Circuit Events</p>
          <p className="circuit-events-banner__title">Running an in-person or commercial event?</p>
          <p className="circuit-events-banner__body">
            A per-tournament pass sized to your field, invoiced per event. For open days, LANs, and
            sponsored brackets that outgrow a subscription.
          </p>
        </div>
        <Link href="/contact-us?topic=circuit-events" style={{ textDecoration: "none", flex: "0 0 auto" }}>
          <Button variant="secondary" size="large">Let&rsquo;s talk</Button>
        </Link>
      </div>

      <p style={{ textAlign: "center", fontSize: "var(--font-size-14)", color: "var(--gray-400, #9aa3b2)", marginTop: "var(--spacing-16)" }}>
        Planned pricing, subject to change. Nothing is charged during preview — every tier is free right now.
      </p>
    </>
  );
}
