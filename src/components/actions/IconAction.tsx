"use client";

import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { IconButton, Tooltip } from "@empac/cascadeds";

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number }>;

/**
 * An icon button with a tooltip that says what it does, for the same action
 * repeated on every row of a list (edit, delete, remove, re-roll). The label
 * is also the accessible name, so make it specific: "Delete the Snacks
 * question", not "Delete". Built on CDS IconButton + Tooltip.
 */
export function IconAction({ label, icon: Icon, variant = "tertiary", onClick, disabled }: {
  label: string;
  icon: TablerIcon;
  /** tertiary for edit-like actions, danger for delete/remove, primary for the card's main refresh. */
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  onClick: () => void;
  disabled?: boolean;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  // CDS gap: Tooltip's trigger span is focusable even around a button, which
  // gives each action two tab stops. Take the span out of the tab order; the
  // tip still shows when the button has focus (focus events bubble to it).
  useEffect(() => {
    wrap.current?.querySelector(".empac-tooltip-trigger")?.setAttribute("tabindex", "-1");
  }, []);
  return (
    <span ref={wrap} className="icon-action">
      <Tooltip content={label} position="top">
        <IconButton variant={variant} size="small" aria-label={label} onClick={onClick} disabled={disabled}>
          <Icon size={18} stroke={2} />
        </IconButton>
      </Tooltip>
    </span>
  );
}

/** A row's icon actions, side by side. */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="row-actions">{children}</span>;
}
