/**
 * Wheel spinner types + the pure winner-picker.
 *
 * A wheel is a streamer-defined list of segments (free text, optional
 * weight + color). Spins are decided server-side via `pickWeightedWinner`
 * so the overlay only has to animate to the chosen index.
 */

import type { FillStyle } from "@/lib/wheel/themes";

export interface WheelSegment {
  label: string;
  /** Relative weight (>= 0). Omitted/invalid → treated as 1. */
  weight?: number;
  /** Optional hex color for the segment; the overlay falls back to a palette. */
  color?: string;
}

/** Who may add viewer entries to the wheel. */
export type ContributionMode = "off" | "everyone" | "allowlist";

/** What happens to entries as the wheel is spun. */
export type ResetMode = "manual" | "on_spin";

export interface WheelContribution {
  mode: ContributionMode;
  /** Total viewer entries allowed on the wheel (clamped 0–5). */
  max: number;
  /** Max entries a single viewer may add. */
  perViewerLimit: number;
  /** Lowercased Twitch logins permitted when mode = "allowlist". */
  allowlist: string[];
  resetMode: ResetMode;
}

export const DEFAULT_CONTRIBUTION: WheelContribution = {
  mode: "off",
  max: 5,
  perViewerLimit: 1,
  allowlist: [],
  resetMode: "manual",
};

export interface Wheel {
  id: string;
  name: string;
  segments: WheelSegment[];
  isDefault: boolean;
  contribution: WheelContribution;
  /** Fixed-segment labels eliminated this round (remove-on-spin). */
  consumedLabels: string[];
  /** Color theme id + slice fill style (see lib/wheel/themes). */
  themeId: string;
  fillStyle: FillStyle;
}

export interface WheelEntry {
  id: string;
  label: string;
  addedByTwitch: string | null;
  addedByDisplay: string | null;
}

/** A spinnable option — fixed segment or viewer entry. */
export interface PoolItem {
  label: string;
  weight?: number;
  color?: string;
  source: "fixed" | "viewer";
  /** Set for viewer entries — the gs_wheel_entries row id (for consume). */
  entryId?: string;
}

export interface WheelSpin {
  id: string;
  wheelId: string | null;
  wheelName: string;
  segments: WheelSegment[];
  winningIndex: number;
  winningLabel: string;
  triggeredBy: string | null;
  triggerType: string;
  createdAt: string;
  /** Snapshot of the wheel's look at spin time. */
  themeId: string;
  fillStyle: FillStyle;
}

/** Normalize a segment weight to a positive finite number (default 1). */
export function segmentWeight(seg: WheelSegment): number {
  const w = seg.weight;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1;
}

/**
 * Pick a winning segment index using weighted random selection. Pure and
 * deterministic given the RNG. Returns -1 for an empty wheel.
 *
 * `rng` is injectable for testing; defaults to Math.random.
 */
export function pickWeightedWinner(
  segments: WheelSegment[],
  rng: () => number = Math.random,
): number {
  if (!segments.length) return -1;
  const total = segments.reduce((sum, s) => sum + segmentWeight(s), 0);
  if (total <= 0) return 0;
  let roll = rng() * total;
  for (let i = 0; i < segments.length; i++) {
    roll -= segmentWeight(segments[i]);
    if (roll < 0) return i;
  }
  return segments.length - 1; // float-rounding safety net
}
