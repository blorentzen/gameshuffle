"use client";

/**
 * Client UI for /staff/scenarios. Two-column layout: scenario picker
 * sidebar on the left, scenario render area on the right.
 *
 * URL state: `?id=<scenario-id>` controls which scenario renders.
 * Browser back/forward and direct links both work.
 *
 * Tier compatibility: when the impersonated tier isn't in the scenario's
 * `validForTiers` list, the right-pane shows an inline warning + a CTA
 * that POSTs to /api/staff/impersonate to switch tiers, then reloads.
 *
 * Per gs-dev-scenarios-spec.md §4.
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Badge, Button } from "@empac/cascadeds";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  SCENARIOS,
  getScenarioById,
  getScenariosByCategory,
} from "./registry";
import type { Scenario, TierTag } from "./types";

type CurrentTier = TierTag | "default";

interface ScenariosPageProps {
  /** Resolved server-side: the staff member's current impersonation
   *  tier. `'default'` means staff with no impersonation cookie set;
   *  for scenario rendering purposes, default behaves like 'pro'
   *  (HIGHEST_TIER) per the spec §3.1. */
  currentTier: CurrentTier;
  /** Initial scenario id from the URL (?id=...). May be invalid; the
   *  page falls back to the first scenario when it is. */
  initialId?: string;
}

export function ScenariosPage({ currentTier, initialId }: ScenariosPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id") ?? initialId ?? null;
  const initialScenario = (idFromUrl && getScenarioById(idFromUrl)) || SCENARIOS[0];
  const [activeId, setActiveId] = useState<string>(initialScenario.id);

  // Effective tier for compatibility checks: default → 'pro' per spec §3.1.
  const effectiveTier: TierTag =
    currentTier === "default" ? "pro" : currentTier;

  const scenario = getScenarioById(activeId) ?? SCENARIOS[0];

  const select = (id: string) => {
    setActiveId(id);
    router.replace(`/staff/scenarios?id=${id}`, { scroll: false });
  };

  return (
    <div className="staff-scenarios">
      <aside className="staff-scenarios__sidebar" aria-label="Scenario picker">
        <Header currentTier={currentTier} effectiveTier={effectiveTier} />
        <Nav activeId={activeId} onSelect={select} />
      </aside>
      <main className="staff-scenarios__main">
        <ScenarioHeader scenario={scenario} />
        <ScenarioBody scenario={scenario} effectiveTier={effectiveTier} />
      </main>
    </div>
  );
}

function Header({
  currentTier,
  effectiveTier,
}: {
  currentTier: CurrentTier;
  effectiveTier: TierTag;
}) {
  return (
    <div className="staff-scenarios__sidebar-header">
      <p className="staff-scenarios__eyebrow">Staff Scenarios</p>
      <p className="staff-scenarios__viewing-as">
        Viewing as: <strong>{tierLabel(effectiveTier)}</strong>
        {currentTier === "default" && (
          <span className="staff-scenarios__hint"> (default)</span>
        )}
      </p>
      <p className="staff-scenarios__hint">
        Switch tier via the floating control in the bottom-right.
      </p>
    </div>
  );
}

function Nav({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="staff-scenarios__nav" aria-label="Scenarios">
      {CATEGORY_ORDER.map((category) => {
        const items = getScenariosByCategory(category);
        if (items.length === 0) return null;
        return (
          <details
            key={category}
            open
            className="staff-scenarios__category"
          >
            <summary className="staff-scenarios__category-title">
              {CATEGORY_LABELS[category]}{" "}
              <span className="staff-scenarios__count">({items.length})</span>
            </summary>
            <ul className="staff-scenarios__list">
              {items.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={
                        "staff-scenarios__item" +
                        (isActive ? " staff-scenarios__item--active" : "")
                      }
                    >
                      {s.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}

function ScenarioHeader({ scenario }: { scenario: Scenario }) {
  return (
    <div className="staff-scenarios__scenario-header">
      <h1 className="staff-scenarios__scenario-title">{scenario.name}</h1>
      <div className="staff-scenarios__scenario-meta">
        <span className="staff-scenarios__scenario-category">
          {CATEGORY_LABELS[scenario.category]}
        </span>
        <span className="staff-scenarios__scenario-tags">
          {scenario.validForTiers.map((t) => (
            <Badge key={t} variant="default" size="small">
              {tierLabel(t)}
            </Badge>
          ))}
        </span>
      </div>
      {scenario.description && (
        <p className="staff-scenarios__scenario-description">{scenario.description}</p>
      )}
    </div>
  );
}

function ScenarioBody({
  scenario,
  effectiveTier,
}: {
  scenario: Scenario;
  effectiveTier: TierTag;
}) {
  const compatible = scenario.validForTiers.includes(effectiveTier);

  if (!compatible) {
    return (
      <IncompatibleScenarioWarning
        scenario={scenario}
        currentTier={effectiveTier}
      />
    );
  }

  const View = scenario.view;
  return (
    <div className="staff-scenarios__render">
      <View fixture={scenario.fixture} />
    </div>
  );
}

function IncompatibleScenarioWarning({
  scenario,
  currentTier,
}: {
  scenario: Scenario;
  currentTier: TierTag;
}) {
  const suggested =
    scenario.suggestedTier ??
    (scenario.validForTiers[0] as TierTag | undefined) ??
    "pro";

  const apply = useMemo(
    () => async () => {
      const option = suggested === "unauth" ? "unauth" : suggested;
      try {
        await fetch("/api/staff/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ option }),
        });
      } finally {
        window.location.reload();
      }
    },
    [suggested]
  );

  return (
    <div className="staff-scenarios__render">
      <Alert variant="warning">
        This scenario isn&apos;t valid for <strong>{tierLabel(currentTier)}</strong>.
        It applies to {scenario.validForTiers.map(tierLabel).join(", ")}.
      </Alert>
      <div style={{ marginTop: "var(--spacing-16)" }}>
        <Button variant="primary" onClick={() => void apply()}>
          Switch to {tierLabel(suggested)}
        </Button>
      </div>
    </div>
  );
}

function tierLabel(tier: TierTag | "default"): string {
  if (tier === "free") return "Free";
  if (tier === "pro") return "Pro";
  if (tier === "pro_plus") return "Pro+";
  if (tier === "unauth") return "Unauthenticated";
  return "Default";
}
