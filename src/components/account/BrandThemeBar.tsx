"use client";

/**
 * BrandThemeBar — a compact indicator + jump-off shown at the top of the
 * streamer-section tabs whose previews are skinned by the brand theme (Overlay
 * Layout, Stream Tools). It shows the CURRENT theme (swatch + name) so the
 * streamer knows what's applied, and links to the ONE canonical editor
 * (Account -> Brand & Theme) rather than duplicating theme controls here — the
 * theming stays in a single place on purpose.
 */

import Link from "next/link";
import { useBrandTheme } from "@/hooks/useBrandTheme";

export function BrandThemeBar({ context }: { context?: string }) {
  const { theme, vars, loading } = useBrandTheme();

  return (
    <div
      style={{
        // The resolved --brand-* vars ride on the bar so `--brand-ink` (link
        // color) reflects the streamer's actual theme, not the site default.
        ...vars,
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-12)",
        flexWrap: "wrap",
        padding: "var(--spacing-12) var(--spacing-16)",
        marginBottom: "var(--spacing-20)",
        borderRadius: "var(--radius-12, 12px)",
        border: "1px solid var(--border-default)",
        background: "var(--bg-secondary, var(--surface-secondary))",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          flex: "0 0 auto",
          background: theme.gradient,
          border: "1px solid var(--border-default)",
        }}
      />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-semibold)" }}>
          Brand theme: {loading ? "…" : theme.name}
        </span>
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
          Skins {context ?? "these previews"} and your live overlay.
        </span>
      </span>
      <Link
        href="/account?tab=theme"
        style={{
          fontSize: "var(--font-size-14)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--brand-ink, var(--text-primary))",
          whiteSpace: "nowrap",
        }}
      >
        Edit theme →
      </Link>
    </div>
  );
}
