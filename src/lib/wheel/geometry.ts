/**
 * Shared wheel geometry — pure math used by both the Pro overlay
 * (`WheelOverlay`) and the free `/wheel-spinner` tool. No React, no DOM.
 *
 * Angles are degrees measured clockwise from the top (12 o'clock), which
 * is where the pointer sits. Slices are sized proportional to weight.
 */

export interface WheelGeoSegment {
  label: string;
  weight?: number;
  color?: string;
}

export interface WheelSlice {
  seg: WheelGeoSegment;
  /** Start angle (deg, clockwise from top). */
  start: number;
  end: number;
  /** Angular center — the angle that should land under the pointer. */
  mid: number;
  index: number;
}

/** Default segment colors when a segment has no explicit color. */
export const WHEEL_PALETTE = [
  "#0e75c1", "#1098ad", "#7048e8", "#e8590c", "#2f9e44",
  "#c2255c", "#1c7ed6", "#f08c00", "#5f3dc4", "#0ca678",
];

function weightOf(seg: WheelGeoSegment): number {
  return typeof seg.weight === "number" && seg.weight > 0 ? seg.weight : 1;
}

/** Prefix-sum the slice angles (proportional to weight). */
export function computeSlices(segments: WheelGeoSegment[]): WheelSlice[] {
  const total = segments.reduce((sum, s) => sum + weightOf(s), 0) || 1;
  return segments.reduce<WheelSlice[]>((acc, seg, index) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    const span = (360 * weightOf(seg)) / total;
    acc.push({ seg, start, end: start + span, mid: start + span / 2, index });
    return acc;
  }, []);
}

/** Point on a rim of `radius` at `angle`, around `center`. */
export function rim(angle: number, radius: number, center: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [center + radius * Math.sin(rad), center - radius * Math.cos(rad)];
}

/** SVG path for a pie slice from `start` to `end` (deg). */
export function slicePath(
  start: number,
  end: number,
  center: number,
  radius: number,
): string {
  const [x0, y0] = rim(start, radius, center);
  const [x1, y1] = rim(end, radius, center);
  const large = end - start > 180 ? 1 : 0;
  return `M ${center} ${center} L ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1} Z`;
}

/**
 * Rotation (deg) that brings slice `winningIndex` under the top pointer
 * after `spins` full turns.
 */
export function landingRotation(
  slices: WheelSlice[],
  winningIndex: number,
  spins = 5,
): number {
  const center = slices[winningIndex]?.mid ?? 0;
  return 360 * spins - center;
}

/** Color for a slice — its own, or the palette by index. */
export function sliceColor(seg: WheelGeoSegment, index: number): string {
  return seg.color ?? WHEEL_PALETTE[index % WHEEL_PALETTE.length];
}

/**
 * Index of the slice currently under the top pointer for a given rotation.
 * Used to fire a "tick" each time the pointer crosses into a new slice.
 */
export function sliceIndexAtPointer(slices: WheelSlice[], rotation: number): number {
  if (!slices.length) return -1;
  const p = (((-rotation) % 360) + 360) % 360;
  for (const s of slices) {
    if (p >= s.start && p < s.end) return s.index;
  }
  return slices.length - 1;
}
