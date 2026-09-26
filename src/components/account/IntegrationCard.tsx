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
    // One gap rule for the whole card instead of a different hand-picked
    // margin on each child. CDS zeroes margins on h* and p on the premise that
    // "containers control spacing via gap", so a card that does NOT set a gap
    // ends up with its text flush — which is why some rows here read fine and
    // others crowded.
    <div
      className="account-card integration-card"
      style={muted ? { opacity: 0.9 } : undefined}
    >
      <div className="integration-card__head">
        <h2>{title}</h2>
        <Badge variant={STATUS_VARIANT[status.kind]} size="small">
          {status.label}
        </Badge>
      </div>
      <p className="integration-card__desc">{description}</p>
      {actions}
      {footnote && <p className="integration-card__foot">{footnote}</p>}
    </div>
  );
}
