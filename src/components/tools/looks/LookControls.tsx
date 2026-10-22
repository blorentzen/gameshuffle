"use client";

/**
 * Small pieces the tool look editors share: a row of choice chips (CDS Chip,
 * pressable) with GS Pro choices shown locked, and the one line that says
 * which choices come with GS Pro.
 */

import Link from "next/link";
import { Chip } from "@empac/cascadeds";
import { IconLock } from "@tabler/icons-react";
import { EVENTS, tagged } from "@/lib/analytics/events";

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  /** GS Pro only: shown locked without GS Pro. */
  pro?: boolean;
}

export function ChoiceChips<T extends string | number>({ choices, value, onChange, pro = false, className = "" }: {
  choices: Choice<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Does the viewer have GS Pro (unlocks `pro` choices)? */
  pro?: boolean;
  className?: string;
}) {
  return (
    <div className={`look-chips${className ? ` ${className}` : ""}`}>
      {choices.map((c) => {
        const locked = !!c.pro && !pro;
        const on = c.value === value;
        return (
          <Chip
            key={String(c.value)}
            label={c.label}
            size="medium"
            clickable
            selected={on}
            variant={on ? "primary" : "default"}
            disabled={locked}
            icon={locked ? <IconLock size={14} aria-hidden /> : undefined}
            aria-label={locked ? `${c.label} (GS Pro)` : undefined}
            onClick={() => onChange(c.value)}
          />
        );
      })}
    </div>
  );
}

/** "Wooden and rust dice come with GS Pro." with a link, for anyone without it. */
export function ProLookNote({ children, from }: { children: React.ReactNode; from: string }) {
  return (
    <p className="look-pro-note">
      {children}{" "}
      <Link href={`/gs-pro?from=${from}`} className={tagged(EVENTS.upgradeClicked, { from })}>See GS Pro</Link>
    </p>
  );
}
