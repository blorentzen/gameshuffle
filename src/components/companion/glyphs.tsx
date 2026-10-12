"use client";

/**
 * The board's icon language, one meaning per glyph and the shape says the
 * kind (the Help sheet's key explains them all):
 *   - circle = an Energy type (also a Pokémon's type)
 *   - square tag = a Special Condition (never an Energy glyph)
 *   - the four-colour circle = "an Energy", any type (the turn's attach)
 *   - a red disc = damage counters
 * Icons only: anything you can press wraps these in a CDS control.
 */

import type { CSSProperties } from "react";
import { useMode } from "@/lib/companion/SessionContext";
import { TablerIcon } from "./TablerIcon";
import { conditionLooks, countersFor, typeDef, type ConditionLook } from "@/lib/companion/looks";

export { conditionLooks, countersFor, typeDef, type ConditionLook };

type Size = "12" | "14" | "16" | "18" | "20" | "24" | "32";
const glyphSize = (px: number): Size => (px >= 44 ? "24" : px >= 34 ? "20" : px >= 26 ? "16" : px >= 20 ? "14" : "12");

export function EnergyDot({ type, size = 22, count, label, decorative = false }: { type: string; size?: number; count?: number; label?: string; decorative?: boolean }) {
  const mode = useMode();
  const def = typeDef(mode, type);
  if (!def) return null;
  const name = label ?? `${def.label}${count != null ? ` ×${count}` : ""}`;
  return (
    <span
      className={`gs-energy-dot${def.invertText ? " gs-energy-dot--light-ink" : ""}`}
      style={{ "--dot-color": def.color, "--dot-size": `${size}px` } as CSSProperties}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name, title: name })}
    >
      <TablerIcon name={def.icon} size={glyphSize(size)} />
      {count != null && count > 1 && <span className="gs-energy-dot__count" aria-hidden="true">{count}</span>}
    </span>
  );
}

export function ConditionTag({ look, size = 22, off = false, decorative = false }: { look: ConditionLook; size?: number; off?: boolean; decorative?: boolean }) {
  return (
    <span
      className={`gs-cond-tag${off ? " gs-cond-tag--off" : ""}`}
      style={{ "--cond-color": look.color, "--cond-ink": look.ink ?? "#ffffff", "--tag-size": `${size}px` } as CSSProperties}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": look.label, title: look.label })}
    >
      <TablerIcon name={look.icon} size={glyphSize(size)} />
    </span>
  );
}

/** "An Energy" of any type: the once-a-turn attach. */
export function AnyEnergy({ size = 14 }: { size?: number }) {
  return <span className="gs-any-energy" style={{ "--dot-size": `${size}px` } as CSSProperties} aria-hidden="true" />;
}

/** A damage counter token: 10 small, 50 medium, 100 large, like the ones on the table. */
export function CounterToken({ value, size, label }: { value: 10 | 50 | 100; size?: number; label?: string | null }) {
  const px = size ?? (value === 100 ? 46 : value === 50 ? 38 : 30);
  return (
    <span className={`gs-token gs-token--${value}`} style={{ "--token-size": `${px}px` } as CSSProperties} aria-hidden="true">
      {label === null ? null : label ?? value}
    </span>
  );
}


/** A card's art window (no frame or text), cropped to cover the box it sits in. */
export function CardArt({ src, className }: { src: string; className?: string }) {
  return (
    <span className={`companion-art${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* Stored cross-origin Scrydex URL, rendered as returned. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} />
    </span>
  );
}
