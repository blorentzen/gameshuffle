/**
 * Overlay format + positioning primitives (Streamer Tools Integration, Phase 0).
 *
 * The overlay is ONE URL that renders correctly in any video ratio: it detects
 * its own format from the browser-source aspect ratio (a `?format=` override
 * wins), then places each tool element via a 9-point anchor + %offset + scale
 * resolved INSIDE a format-specific safe area — so one event payload lays out
 * right in both 16:9 and 9:16.
 */

import type { CSSProperties } from "react";

export type OverlayFormat = "landscape" | "portrait" | "square";

export type Anchor =
  | "top-left" | "top-center" | "top-right"
  | "mid-left" | "center" | "mid-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

/** Safe-area insets as % of the viewport (keeps elements off platform UI). */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Per-element placement within the safe area. */
export interface ElementPlacement {
  anchor: Anchor;
  offsetPct: { x: number; y: number };
  scale: number;
  enabled: boolean;
}

export interface LayoutProfile {
  safeArea?: SafeArea | null;
  elements: Record<string, Partial<ElementPlacement>>;
}

// --- Defaults -------------------------------------------------------------

export const DEFAULT_SAFE_AREA: Record<OverlayFormat, SafeArea> = {
  // Small clearance off every edge; a touch more at the bottom for OBS
  // status bars / captions. (Not a full lower-third reserve — most
  // streamers don't run a full-width facecam, and tools should be able to
  // use the lower area. Streamers who do can hide/raise tools per format.)
  landscape: { top: 6, right: 4, bottom: 12, left: 4 },
  // Portrait: reserve the handle (top), captions (bottom), and the right
  // action rail (like/comment/share) so tools sit in the usable central band.
  portrait: { top: 12, right: 22, bottom: 24, left: 5 },
  square: { top: 8, right: 8, bottom: 12, left: 8 },
};

const GENERIC_PLACEMENT: ElementPlacement = {
  anchor: "center",
  offsetPct: { x: 0, y: 0 },
  scale: 1,
  enabled: true,
};

/** Per-format, per-tool defaults. Tools not listed use GENERIC_PLACEMENT. */
export const DEFAULT_LAYOUTS: Record<OverlayFormat, Record<string, Partial<ElementPlacement>>> = {
  landscape: {
    dice: { anchor: "bottom-center", scale: 1 },
    coin: { anchor: "bottom-center", scale: 1 },
    oracle: { anchor: "center", scale: 1 },
    timer: { anchor: "top-center", scale: 1 },
    name_picker: { anchor: "center", scale: 1 },
    bingo: { anchor: "mid-right", scale: 1 },
    tierlist: { anchor: "mid-left", scale: 1 },
  },
  portrait: {
    dice: { anchor: "center", scale: 0.9 },
    coin: { anchor: "center", scale: 0.9 },
    oracle: { anchor: "center", scale: 0.9 },
    timer: { anchor: "top-center", scale: 0.9 },
    name_picker: { anchor: "center", scale: 0.9 },
    bingo: { anchor: "center", scale: 0.95 },
    tierlist: { anchor: "center", scale: 0.95 },
  },
  square: {},
};

// --- Detection ------------------------------------------------------------

export function detectFormat(width: number, height: number): OverlayFormat {
  if (height <= 0 || width <= 0) return "landscape";
  const ratio = width / height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.85) return "portrait";
  return "square";
}

/** Read the format from a `?format=` override, else detect from the viewport. */
export function resolveFormat(search: string, width: number, height: number): OverlayFormat {
  const p = new URLSearchParams(search).get("format");
  if (p === "landscape" || p === "portrait" || p === "square") return p;
  return detectFormat(width, height);
}

// --- Placement resolution -------------------------------------------------

const H_FRAC: Record<Anchor, number> = {
  "top-left": 0, "mid-left": 0, "bottom-left": 0,
  "top-center": 0.5, center: 0.5, "bottom-center": 0.5,
  "top-right": 1, "mid-right": 1, "bottom-right": 1,
};
const V_FRAC: Record<Anchor, number> = {
  "top-left": 0, "top-center": 0, "top-right": 0,
  "mid-left": 0.5, center: 0.5, "mid-right": 0.5,
  "bottom-left": 1, "bottom-center": 1, "bottom-right": 1,
};

/** Merge stored layout over defaults for a tool. */
export function resolvePlacement(
  format: OverlayFormat,
  toolId: string,
  layout?: LayoutProfile | null,
): ElementPlacement {
  const def = DEFAULT_LAYOUTS[format]?.[toolId] ?? {};
  const stored = layout?.elements?.[toolId] ?? {};
  return {
    ...GENERIC_PLACEMENT,
    ...def,
    ...stored,
    offsetPct: { ...GENERIC_PLACEMENT.offsetPct, ...def.offsetPct, ...stored.offsetPct },
  };
}

/** CSS style that positions an element at its placement inside the safe area. */
export function placementStyle(
  format: OverlayFormat,
  toolId: string,
  layout?: LayoutProfile | null,
): CSSProperties {
  const p = resolvePlacement(format, toolId, layout);
  const safe = layout?.safeArea ?? DEFAULT_SAFE_AREA[format];
  const safeW = 100 - safe.left - safe.right;
  const safeH = 100 - safe.top - safe.bottom;
  const hFrac = H_FRAC[p.anchor];
  const vFrac = V_FRAC[p.anchor];
  const leftPct = safe.left + hFrac * safeW + p.offsetPct.x;
  const topPct = safe.top + vFrac * safeH + p.offsetPct.y;
  return {
    position: "fixed",
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: `translate(${-hFrac * 100}%, ${-vFrac * 100}%) scale(${p.scale})`,
    transformOrigin: "center",
  };
}

// --- Editor helpers (client-safe) -----------------------------------------

/** Whether a tool element is enabled for a format (honored by the overlay). */
export function isPlacementEnabled(
  format: OverlayFormat,
  toolId: string,
  layout?: LayoutProfile | null,
): boolean {
  return resolvePlacement(format, toolId, layout).enabled;
}

/** The on-screen anchor point (% of viewport) where a tool currently sits. */
export function anchorPointPct(
  format: OverlayFormat,
  toolId: string,
  layout?: LayoutProfile | null,
): { x: number; y: number } {
  const p = resolvePlacement(format, toolId, layout);
  const safe = layout?.safeArea ?? DEFAULT_SAFE_AREA[format];
  const safeW = 100 - safe.left - safe.right;
  const safeH = 100 - safe.top - safe.bottom;
  return {
    x: safe.left + H_FRAC[p.anchor] * safeW + p.offsetPct.x,
    y: safe.top + V_FRAC[p.anchor] * safeH + p.offsetPct.y,
  };
}

/** The resolved anchor for a tool (default merged with any stored override). */
export function resolvedAnchor(
  format: OverlayFormat,
  toolId: string,
  layout?: LayoutProfile | null,
): Anchor {
  return resolvePlacement(format, toolId, layout).anchor;
}

/**
 * Compute the `offsetPct` that places a tool's `anchor` point at (targetX,
 * targetY) % of the viewport. Inverse of the placement math — used by the
 * editor when the streamer drags an element.
 */
export function offsetForAnchorAt(
  format: OverlayFormat,
  anchor: Anchor,
  targetX: number,
  targetY: number,
  safeArea?: SafeArea | null,
): { x: number; y: number } {
  const safe = safeArea ?? DEFAULT_SAFE_AREA[format];
  const safeW = 100 - safe.left - safe.right;
  const safeH = 100 - safe.top - safe.bottom;
  return {
    x: targetX - (safe.left + H_FRAC[anchor] * safeW),
    y: targetY - (safe.top + V_FRAC[anchor] * safeH),
  };
}
