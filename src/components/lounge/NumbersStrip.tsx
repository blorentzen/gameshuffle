import type { ReactNode } from "react";
import type { Square } from "@/lib/mmr/rules";

/**
 * A lounge player's numbers in one strip (lounge page picks, 2026-10-20: one strip instead of
 * six stat cards). A description list, values over their labels; the cells share one frame
 * and wrap two or three to a row on smaller screens. Not a widget, so it is our own markup:
 * CascadeDS's StatCard is a card each, which is what this replaces.
 */
export interface StripCell { key: string; label: ReactNode; value: ReactNode }

export function NumbersStrip({ cells, label }: { cells: StripCell[]; label: string }) {
  return (
    <dl className="lounge-strip" aria-label={label}>
      {cells.map((c) => (
        <div key={c.key} className="lounge-strip__cell">
          <dt>{c.label}</dt>
          <dd>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const WORD: Record<Square, string> = { w: "win", l: "loss", p: "win to a new season peak" };

/** The last ten events as the MMR card's squares, oldest first: a gain, a loss, gold for a new season peak. */
export function FormSquares({ marks }: { marks: Square[] }) {
  if (!marks.length) return <span className="lounge-strip__none">No events yet</span>;
  return (
    <>
      <span className="lounge-form" aria-hidden="true">
        {marks.map((m, i) => <i key={i} className={`lounge-form__sq lounge-form__sq--${m}`} />)}
      </span>
      <span className="sr-only">Oldest first: {marks.map((m) => WORD[m]).join(", ")}.</span>
    </>
  );
}
