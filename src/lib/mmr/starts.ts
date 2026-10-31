/**
 * Ready-made cards (studio round 2, 2026-10-30, picks https://claude.ai/artifact/LhQzo8t9w4LNPRkbHodt1s, all as
 * recommended): each sets a layout and what's on the card, in place of the four presets that only set the
 * pieces. Colors, background, emblem, font, border, branding and the moments stay as the player had them, and
 * so do GS Pro's own line and tonight's goal switch (trimmed to the layout's room like anything else). Pure.
 */

import type { MmrLook, MmrLayout } from "./look";
import type { RollShape } from "./rolling";
import { FREE_PIECES, PRESETS, trimToRoom, type MmrBig, type MmrPiece } from "./pieces";

export type MmrStartId = "usual" | "number" | "rank" | "panel" | "strip" | "rolling";

export interface MmrStart {
  id: MmrStartId;
  label: string;
  note: string;
  layout: MmrLayout;
  on: MmrPiece[];
  big: MmrBig;
  hideMmr: boolean;
  /** Rolling's shape. */
  shape?: RollShape;
}

const STANDARD = PRESETS.find((p) => p.id === "standard")!.on;

export const STARTS: MmrStart[] = [
  { id: "usual", label: "The usual", note: "Number, division, progress, peak and tonight.", layout: "deck", on: STANDARD, big: "mmr", hideMmr: false },
  { id: "number", label: "Just the number", note: "Your medal, MMR and name.", layout: "sticker", on: ["name", "mmr"], big: "mmr", hideMmr: false },
  { id: "rank", label: "Rank only", note: "Your division, no MMR anywhere.", layout: "sticker", on: ["name", "division", "mmr", "delta"], big: "division", hideMmr: true },
  { id: "panel", label: "Stream panel", note: "Four tiles beside your number.", layout: "panel", on: STANDARD, big: "mmr", hideMmr: false },
  { id: "strip", label: "Squares strip", note: "A thin bar with your last 10.", layout: "strip", on: ["name", "cc", "division", "mmr", "progress", "delta", "last10"], big: "mmr", hideMmr: false },
  { id: "rolling", label: "Everything, in turn", note: "One piece at a time, all of them.", layout: "rolling", on: FREE_PIECES, big: "mmr", hideMmr: false, shape: "bar" },
];

/** The look with a ready-made card's layout and pieces (the rest of the look kept). */
export function applyStart(look: MmrLook, id: MmrStartId): MmrLook {
  const s = STARTS.find((x) => x.id === id);
  if (!s) return look;
  const on = { ...look.info.on };
  for (const p of FREE_PIECES) on[p] = s.on.includes(p);
  const info = trimToRoom({ ...look.info, on, big: s.big, hideMmr: s.hideMmr, under: "none" }, s.layout).info;
  return { ...look, layout: s.layout, info, rolling: s.shape ? { ...look.rolling, shape: s.shape } : look.rolling };
}

/** The ready-made card this look matches, or null once it's the player's own mix. */
export function startOf(look: MmrLook): MmrStartId | null {
  const s = STARTS.find((x) =>
    x.layout === look.layout && x.big === look.info.big && x.hideMmr === look.info.hideMmr && look.info.under === "none"
    && (!x.shape || x.shape === look.rolling.shape)
    && FREE_PIECES.every((p) => look.info.on[p] === x.on.includes(p)));
  return s?.id ?? null;
}
