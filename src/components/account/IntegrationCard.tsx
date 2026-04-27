"use client";

/**
 * Reusable shell for an integration entry on /account → Integrations.
 * Lets each integration pick its own status pill + primary action while
 * keeping the card framing consistent. Works for both "Coming Soon"
 * stubs (YouTube/Kick) and functional integrations with connect flows.
 */

import type { ReactNode } from "react";
import { Badge } from "@empac/cascadeds";

export type IntegrationStatusKind = "live" | "beta" | "coming_soon";

interface IntegrationCardProps {
  title: string;
  /** One-line value prop rendered below the title. */
  description: string;
  /** Status pill — label + color variant. */
  status: { label: string; kind: IntegrationStatusKind };
  /** Optional action row (buttons, inputs) rendered below the description. */
  actions?: ReactNode;
  /** Optional footer note rendered in muted 12px text. */
  footnote?: ReactNode;
  /** Muted (greyscale) appearance for Coming Soon states. */
  muted?: boolean;
}

const STATUS_VARIANT: Record<IntegrationStatusKind, "success" | "warning" | "default"> = {
  live: "success",
  beta: "warning",
  coming_soon: "default",
};

export function IntegrationCard({
  title,
  description,
  status,
  actions,
  footnote,
  muted,
}: IntegrationCardProps) {
  return (
    <div
      className="account-card"
      style={muted ? { opacity: 0.9 } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Badge variant={STATUS_VARIANT[status.kind]} size="small">
          {status.label}
        </Badge>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginTop: 0, marginBottom: actions ? "var(--spacing-16)" : 0 }}>
        {description}
      </p>
      {actions}
      {footnote && (
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-12)", marginBottom: 0 }}>
          {footnote}
        </p>
      )}
    </div>
  );
}
