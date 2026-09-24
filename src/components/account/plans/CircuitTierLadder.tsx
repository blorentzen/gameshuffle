"use client";

/**
 * The Circuit tiers, compared, inside the account.
 *
 * The Plans tab used to show one flat bullet list and two price buttons, which
 * gave an organizer no way to answer the only question they have: which tier do
 * I need? So each tier is a column, and the three things that actually differ
 * between them lead — field size, ticket fee, SMS allowance. The ticket fee in
 * particular was not surfaced anywhere in the product despite being the whole
 * return-on-investment argument for Circuit 256 (no platform fee at all).
 *
 * Honest about the preview: while `organizer_billing_enabled` is off every tier
 * is free, and the marketing page says so. Showing live "Subscribe · $29/mo"
 * buttons here contradicted that, so the ladder reads the same flag.
 */

import Link from "next/link";
import { Button, Card } from "@empac/cascadeds";
import { CIRCUIT_TIERS, CIRCUIT_PAID_FEATURES, type CircuitTier, type CircuitTierId } from "@/lib/tournaments/circuit";
import { usd, type PublicPricing } from "@/lib/pricing/publicTypes";
import { feeLabel } from "@/lib/plans/highlights";

const FEATURE_LABEL: Record<(typeof CIRCUIT_PAID_FEATURES)[number], string> = {
  analytics: "Ticket sales analytics",
  promo_codes: "Promo codes",
  series: "Championship series",
  co_organizers: "Co-organizers",
  branding: "Custom page branding",
  seeding: "Custom seeding & redraw",
  randomizer: "Live randomized rounds",
};

const LADDER = CIRCUIT_TIERS.filter((t) => t.id !== "circuit_events");

function capLabel(t: CircuitTier): string {
  if (t.playerCap === "lobby") return "One full lobby";
  if (t.playerCap === "override") return "Sized per event";
  return `Up to ${t.playerCap} players`;
}

function capDetail(t: CircuitTier): string {
  if (t.playerCap === "lobby") return "12 on MK8DX, 24 on MK World. Every format, no account cost.";
  return `Across as many lobbies as the field needs.`;
}

export function CircuitTierLadder({
  pricing,
  annual,
  onAnnualChange,
  currentTier,
  billingEnabled,
  busyTier,
  onSubscribe,
}: {
  pricing: PublicPricing;
  annual: boolean;
  onAnnualChange: (annual: boolean) => void;
  /** The tier this account is on, so it can be marked rather than re-sold. */
  currentTier: CircuitTierId | null;
  /** False while organizer billing is in preview: every tier is free. */
  billingEnabled: boolean;
  busyTier: string | null;
  onSubscribe: (tier: "circuit_64" | "circuit_256") => void;
}) {
  const amounts = (t: CircuitTier) => {
    const live = pricing.plans[t.id];
    if (live && (live.monthly != null || live.annual != null)) return live;
    return t.price && t.price !== "quoted" ? { monthly: t.price.monthlyUsd, annual: t.price.annualUsd } : null;
  };

  return (
    <div className="circuit-ladder">
      <div className="circuit-ladder__toggle-row">
        <div className="plan-toggle" role="group" aria-label="Billing interval">
          {([["Monthly", false], ["Annual", true]] as const).map(([label, val]) => (
            <button
              key={label}
              type="button"
              className={`plan-toggle__option${annual === val ? " is-active" : ""}`}
              aria-pressed={annual === val}
              onClick={() => onAnnualChange(val)}
            >
              {label}
              {label === "Annual" ? " · save ~2 mo" : ""}
            </button>
          ))}
        </div>
        {!billingEnabled && (
          <p className="circuit-ladder__preview">
            Organizer billing is in preview, so every tier is free right now. These are the planned prices.
          </p>
        )}
      </div>

      <div className="circuit-ladder__cards">
        {LADDER.map((t) => {
          const a = amounts(t);
          const isCurrent = (currentTier ?? "free") === t.id;
          const featured = t.id === "circuit_256";
          const paid = t.id === "circuit_64" || t.id === "circuit_256";
          return (
            <Card
              key={t.id}
              variant={featured ? "elevated" : "outlined"}
              padding="medium"
              className={`circuit-tier${featured ? " circuit-tier--featured" : ""}${isCurrent ? " circuit-tier--current" : ""}`}
            >
              <div className="circuit-tier__head">
                <span className="circuit-tier__name">{t.displayName}</span>
                {isCurrent && <span className="circuit-tier__badge">Your plan</span>}
              </div>

              <p className="circuit-tier__price">
                {a ? (
                  <>
                    {annual ? usd(a.annual) : usd(a.monthly)}
                    <span className="circuit-tier__per">{annual ? "/yr" : "/mo"}</span>
                  </>
                ) : (
                  <>Free</>
                )}
              </p>

              {/* The three things that actually differ between tiers. */}
              <dl className="circuit-tier__specs">
                <div>
                  <dt>Field size</dt>
                  <dd>{capLabel(t)}</dd>
                </div>
                <div>
                  <dt>Paid tickets</dt>
                  <dd>{feeLabel(pricing.platformFee[t.id])}</dd>
                </div>
                <div>
                  <dt>SMS reminders</dt>
                  <dd>
                    {pricing.smsSegments[t.id]
                      ? `${pricing.smsSegments[t.id]!.toLocaleString()} / month`
                      : "Not included"}
                  </dd>
                </div>
              </dl>

              <p className="circuit-tier__detail">{capDetail(t)}</p>

              {t.paidFeatures ? (
                <ul className="circuit-tier__features">
                  {t.id === "circuit_256" && (
                    <li>
                      <strong>GameShuffle Pro included</strong>
                    </li>
                  )}
                  {CIRCUIT_PAID_FEATURES.map((f) => (
                    <li key={f}>{FEATURE_LABEL[f]}</li>
                  ))}
                </ul>
              ) : (
                <ul className="circuit-tier__features">
                  <li>Every format and the whole scoring toolkit</li>
                  <li>Live scoring and a public join page</li>
                  <li>Picks &amp; bans and build rules</li>
                </ul>
              )}

              <div className="circuit-tier__cta">
                {isCurrent ? (
                  <Button variant="secondary" fullWidth disabled>
                    Current plan
                  </Button>
                ) : paid && billingEnabled ? (
                  <Button
                    variant={featured ? "primary" : "secondary"}
                    fullWidth
                    loading={busyTier === t.id}
                    onClick={() => onSubscribe(t.id as "circuit_64" | "circuit_256")}
                  >
                    Choose {t.displayName}
                  </Button>
                ) : (
                  <Link href="/tournament/create" style={{ textDecoration: "none", display: "block" }}>
                    <Button variant={featured ? "primary" : "secondary"} fullWidth>
                      {billingEnabled ? "Create a tournament" : "Try it free in preview"}
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="circuit-events-row">
        <div>
          <p className="circuit-events-row__title">Running an in-person or commercial event?</p>
          <p className="circuit-events-row__body">
            Circuit Events is a per-tournament pass sized to your field, invoiced per event, with no platform
            fee on tickets. For open days, LANs and sponsored brackets that outgrow a subscription.
          </p>
        </div>
        <Link href="/contact-us?topic=circuit-events" style={{ textDecoration: "none", flex: "0 0 auto" }}>
          <Button variant="secondary">Let&rsquo;s talk</Button>
        </Link>
      </div>
    </div>
  );
}
