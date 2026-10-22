import type { ReactNode } from "react";
import type { DiceTable as Table } from "@/lib/tools/looks";

/**
 * A table to roll the dice onto (item 10): felt or wood inside a rim. The
 * dice (the physics canvas or the simple cubes) go in the felt area, inset
 * inside the rim, so the physics walls stop the dice at the felt's edge.
 */
export function DiceTable({ table, children, className = "" }: { table: Table; children: ReactNode; className?: string }) {
  return (
    <div className={`dice-table dice-table--${table}${className ? ` ${className}` : ""}`}>
      <div className="dice-table__felt">{children}</div>
    </div>
  );
}
