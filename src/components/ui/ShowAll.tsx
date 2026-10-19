"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { Button } from "@empac/cascadeds";

/**
 * A long list cut to its first part with a fade, then "Show all N"
 * (Britton's pick, 2026-10-19, https://claude.ai/artifact/QaSjiFxbYHkNBAQq53xvpq).
 * The whole list is rendered (on the server too), so search and screen readers
 * still get every item; only the visible height is clipped. Meant for lists of
 * text and pictures, not links (a clipped link could still take focus). CDS has
 * no collapsible, so this is a CDS Button over a clipped box; on the CascadeDS
 * fix list as a candidate component. The button hides itself when the list
 * already fits.
 */
export function ShowAll({ children, height, label, lessLabel = "Show less", className }: {
  children: ReactNode;
  /** Visible height while collapsed, a CSS length (e.g. "42rem"). */
  height: string;
  /** "Show all 132 minigames". */
  label: string;
  lessLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState(false);
  const id = useId();
  // Measured after paint: a list shorter than the cut needs no button and no fade.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (el) setFits(el.scrollHeight <= el.clientHeight + 2);
  }, []);
  return (
    <div className={`show-all${open || fits ? " show-all--open" : ""}${className ? ` ${className}` : ""}`}>
      <div id={id} ref={measure} className="show-all__body" style={open ? undefined : { maxHeight: height }}>{children}</div>
      {!fits && (
        <Button variant="secondary" size="small" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? lessLabel : label}
        </Button>
      )}
    </div>
  );
}
