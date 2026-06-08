"use client";

/**
 * Canonical d6 pip face. Renders the 3x3 dot arrangement for values
 * 1-6 using a CSS grid — accessibility text lives below the face
 * in the parent (so screen readers and low-vision users see the
 * number even if pip recognition fails them).
 *
 * Non-d6 faces don't have a culturally canonical pip layout (a d10
 * is usually a digit, a d20 a digit) so the parent should fall back
 * to rendering the digit directly when `faces !== 6`. This
 * component intentionally returns null in that case rather than
 * inventing a non-standard arrangement.
 */

import type { CSSProperties } from "react";

interface Props {
  /** 1-6 inclusive — renders the canonical pip pattern. 0 or null
   *  renders a blank face. Other values are clamped to 1-6. */
  value: number | null;
  /** When true the face renders as the "tumbling" state — used during
   *  the modal's roll animation. Shows a `?` in the center cell so the
   *  user can't read the final value mid-spin. */
  rolling?: boolean;
  /** When true the face renders the canonical 5-pip die pattern at
   *  reduced contrast so it reads as "tap to roll" rather than as a
   *  result. Used by the center-band button before any roll happens. */
  neutral?: boolean;
  /** Optional accessible name override. Defaults to "Die showing N". */
  ariaLabel?: string;
}

/**
 * 3x3 grid cell indices that hold a pip for each value.
 * Layout:
 *   1 2 3
 *   4 5 6
 *   7 8 9
 */
const PIP_CELLS: Record<number, ReadonlyArray<number>> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export function DicePips({
  value,
  rolling = false,
  neutral = false,
  ariaLabel,
}: Props) {
  if (rolling) {
    return (
      <div
        className="companion-pips companion-pips--rolling"
        role="img"
        aria-label={ariaLabel ?? "Die rolling"}
      >
        <div className="companion-pips__rolling-mark">?</div>
      </div>
    );
  }

  const isBlank = !neutral && (value == null || value === 0);
  // Neutral mode renders the canonical 5-pip pattern (4 corners +
  // center) at reduced contrast — that's the most universally
  // "die-like" arrangement, and the contrast cue makes it read as
  // a preview rather than a freshly-rolled 5.
  const renderValue = neutral
    ? 5
    : isBlank
      ? 0
      : Math.max(1, Math.min(6, Math.round(value ?? 0)));
  const cells = isBlank ? [] : PIP_CELLS[renderValue] ?? [];

  return (
    <div
      className={`companion-pips${
        isBlank ? " companion-pips--blank" : ""
      }${neutral ? " companion-pips--neutral" : ""}`}
      role="img"
      aria-label={
        ariaLabel ??
        (neutral
          ? "Tap to roll"
          : isBlank
            ? "Blank die"
            : `Die showing ${renderValue}`)
      }
    >
      {Array.from({ length: 9 }, (_, i) => {
        const cell = i + 1;
        const showPip = cells.includes(cell);
        // Inline grid-area lookup so the parent CSS can stay generic
        // (the grid template is fixed; only the pip presence varies).
        const style: CSSProperties = {
          gridArea: `cell-${cell}`,
        };
        return (
          <span
            key={cell}
            className={`companion-pips__cell${
              showPip ? " companion-pips__cell--filled" : ""
            }`}
            style={style}
            aria-hidden="true"
          >
            {showPip && <span className="companion-pips__dot" />}
          </span>
        );
      })}
    </div>
  );
}
