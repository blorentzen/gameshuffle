"use client";

/**
 * Reusable shell for an integration entry on /account → Integrations.
 * Lets each integration pick its own status pill + primary action while
 * keeping the card framing consistent. Works for both "Coming Soon"
 * stubs (YouTube/Kick) and functional integrations with connect flows.
 */

import type { ReactNode } from "react";

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

const STATUS_COLORS: Record<IntegrationStatusKind, { bg: string; fg: string; border: string }> = {
  live: {
    bg: "#e6f7ee",
    fg: "#1a7c45",
    border: "#b7e4c7",
  },
  beta: {
    bg: "#fff8e1",
    fg: "#806020",
    border: "#f0d97a",
  },
  coming_soon: {
    bg: "#f0f1f3",
    fg: "#505050",
    border: "#d0d4d9",
  },
};

export function IntegrationCard({
  title,
  description,
  status,
  actions,
  footnote,
  muted,
}: IntegrationCardProps) {
  const palette = STATUS_COLORS[status.kind];
  return (
    <div
      className="account-card"
      style={muted ? { opacity: 0.9 } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "0.2rem 0.55rem",
            borderRadius: "999px",
            background: palette.bg,
            color: palette.fg,
            border: `1px solid ${palette.border}`,
          }}
        >
          {status.label}
        </span>
      </div>
      <p style={{ color: "#606060", fontSize: "14px", marginTop: 0, marginBottom: actions ? "1rem" : 0 }}>
        {description}
      </p>
      {actions}
      {footnote && (
        <p style={{ color: "#808080", fontSize: "12px", marginTop: "0.75rem", marginBottom: 0 }}>
          {footnote}
        </p>
      )}
    </div>
  );
}
