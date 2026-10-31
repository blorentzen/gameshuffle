import type { ReactNode } from "react";

/**
 * A CDS Table that may be wider than a phone: the table keeps its text size
 * and this box scrolls sideways (legibility over fit). CDS's own scroll
 * container can't take focus, so keyboard users couldn't scroll it (axe
 * scrollable-region-focusable); this box can. Remove once CascadeDS makes its
 * table container focusable (on the CDS fix list). Server-safe.
 */
export function TableScroll({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`table-scroll${className ? ` ${className}` : ""}`} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
