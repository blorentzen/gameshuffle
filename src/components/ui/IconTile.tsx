import type { ReactNode } from "react";
import type { Icon } from "@tabler/icons-react";

/**
 * The site's one icon tile (design round 3, Britton's picks 2026-10-20): a
 * Tabler glyph, white, on a gradient rounded square. Two sizes: `md` (40px,
 * 12px corners) in cards, rows and lists; `lg` (56px, 14px corners) only
 * beside a page's main heading or a band's title. Cards put it above the
 * title, rows and lists beside the label. Seven shared colors plus the four
 * dailies' own; the gradients are tokens in globals.css (`--tile-*`), so a
 * CSS-only tile elsewhere can use the same values. Decorative by default
 * (the label beside it says the same thing). Server-safe.
 *
 * CascadeDS has no icon tile yet; this is on the CDS fix list to contribute back.
 */
export type TileTone =
  | "blue" | "violet" | "magenta" | "teal" | "green" | "orange" | "red"
  | "shuffle" | "dex" | "fire" | "weekly" | "duel";

export type TileSize = "md" | "lg";

/** The tile's classes, for markup that can't use the component (a CSS-only tile, a CDS slot). */
export function iconTileClass(tone: TileTone = "blue", size: TileSize = "md"): string {
  return `icon-tile icon-tile--${tone}${size === "lg" ? " icon-tile--lg" : ""}`;
}

export function IconTile({ icon: Glyph, tone = "blue", size = "md", className, label, children }: {
  /** A Tabler icon component. Leave out to pass a glyph as children (a CDS Icon, a masked brand mark). */
  icon?: Icon;
  tone?: TileTone;
  size?: TileSize;
  className?: string;
  /** Names the picture for screen readers when nothing beside it does. */
  label?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={`${iconTileClass(tone, size)}${className ? ` ${className}` : ""}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {Glyph ? <Glyph size={size === "lg" ? 30 : 22} stroke={2} aria-hidden /> : children}
    </span>
  );
}
