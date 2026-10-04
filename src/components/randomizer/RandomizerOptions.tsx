"use client";

/**
 * The "Options" button for a randomizer's intro card: everything past the one
 * choice people make every time (rules, house rules, chaos) lives in a CDS
 * Drawer instead of a wall of chips, with a line saying what is switched on.
 */

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Drawer } from "@empac/cascadeds";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";

export function RandomizerOptions({ summary, title = "Options", subtitle, children }: {
  /** The options switched on, in words, shown beside the button. */
  summary: string[];
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Mounted on first open and kept, so the close animation still plays. Portaled
  // to <body>: a styled ancestor would otherwise pin the "fixed" drawer to itself.
  const [used, setUsed] = useState(false);
  return (
    <div className="randomizer-options__bar">
      <span className="randomizer-options__label">Options</span>
      <p className="randomizer-options__summary">{summary.length ? summary.join(" · ") : "Nothing extra switched on"}</p>
      <Button variant="secondary" size="small" iconBefore={IconAdjustmentsHorizontal} onClick={() => { setUsed(true); setOpen(true); }}>Change options</Button>
      {used && createPortal(
        <Drawer open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} position="right" size="compact"
          primaryAction={{ label: "Done", onClick: () => setOpen(false) }}>
          <div className="randomizer-options">{children}</div>
        </Drawer>,
        document.body,
      )}
    </div>
  );
}
