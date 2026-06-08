"use client";

/**
 * Icon wrapper that picks the right source automatically:
 *   1. If the name is in CDS's exposed icon set → render via CDS
 *      (matches the design-system styling).
 *   2. Otherwise, fall back to the direct `@tabler/icons-react`
 *      import via the EXTRAS map below.
 *
 * CDS only exposes a curated subset of Tabler. When we need an icon
 * outside that subset (e.g. `cards` for the Standard TCG format
 * card, `playing-card` for future use), we register it here and
 * everything else stays the same.
 *
 * Adding a new icon = one import + one EXTRAS entry.
 */

import { Icon as CdsIcon } from "@empac/cascadeds";
import {
  IconCards,
  IconCardsFilled,
  IconLayoutCards,
  IconPlayCardStar,
  type IconProps,
} from "@tabler/icons-react";

type TablerComponent = (props: IconProps) => React.ReactNode;

/** Names that aren't in CDS but ARE in the broader Tabler set. */
const EXTRAS: Record<string, TablerComponent> = {
  cards: IconCards,
  "cards-filled": IconCardsFilled,
  "layout-cards": IconLayoutCards,
  "play-card-star": IconPlayCardStar,
};

interface Props {
  name: string;
  /** CDS icon-component size scale — kept aligned so consumers can
   *  pass the same value regardless of the underlying source. */
  size?: "12" | "14" | "16" | "18" | "20" | "24" | "32" | "40" | "48" | "64";
  /** Optional color override. Defaults to currentColor. */
  color?: string;
}

export function TablerIcon({ name, size = "16", color }: Props) {
  const Extra = EXTRAS[name];
  if (Extra) {
    const px = Number(size);
    return <Extra size={px} color={color ?? "currentColor"} stroke={2} />;
  }
  // Fall through to CDS for names it exposes. The `as` cast is safe
  // here because the runtime accepts unknown names by rendering a
  // placeholder; we just lose TypeScript narrowing.
  return (
    <CdsIcon
      name={name as Parameters<typeof CdsIcon>[0]["name"]}
      size={size}
      color={color}
    />
  );
}
