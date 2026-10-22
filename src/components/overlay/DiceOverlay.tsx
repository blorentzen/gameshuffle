"use client";

/**
 * Dice overlay renderer: the same CSS cubes as the free page's Simple roll
 * (DiceCube), tumbling in and settling on the roll, in the streamer's dice
 * look. With "Show the table on stream" on, they land on the chosen table.
 * Format-agnostic: the caller passes `style` from `placementStyle()`.
 */

import type { CSSProperties } from "react";
import { DiceRow } from "@/components/tools/dice/DiceCube";
import { DiceTable } from "@/components/tools/dice/DiceTable";
import { pipFor, type DiceTable as Table } from "@/lib/tools/looks";

export interface DiceOverlayPayload {
  values: number[];
  dieColor?: string;
  pipColor?: string;
  /** The table to draw under the dice, when the streamer shows it on stream. */
  table?: Table | null;
  triggeredBy?: string | null;
}

export function DiceOverlay({ payload, style }: { payload: DiceOverlayPayload; style?: CSSProperties }) {
  const { values, dieColor = "#ffffff", table = null } = payload;
  const pipColor = payload.pipColor ?? pipFor(dieColor);
  const total = values.reduce((a, b) => a + b, 0);
  const row = <DiceRow count={values.length} values={values} reveal="animated" dieColor={dieColor} pipColor={pipColor} />;
  return (
    <div className="gs-overlay-dice" style={style}>
      {table ? (
        <DiceTable table={table} className="gs-overlay-dice__table">
          <div className="dice-table__cubes">{row}</div>
        </DiceTable>
      ) : row}
      {values.length > 1 && <div className="gs-overlay-dice__total">= {total}</div>}
    </div>
  );
}
