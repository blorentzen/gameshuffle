/**
 * One row of the control room's levers: what it is, its option, its buttons.
 * Every row shares the same three columns so options line up under options
 * and buttons under buttons, however many a row has (2026-10-10: the rolls
 * and tools each had their own layout and the page read as scattered).
 *
 * Button rules for a row (and the whole control room):
 *   - small buttons only;
 *   - the row's actions are `secondary`; the first is the main one and gets
 *     the shared width (`hub-lever__main`) so the column reads as one;
 *   - utilities (Clear, Entries, Show board) are `ghost`, after the actions;
 *   - one `primary` on the page: the game's main roll.
 * A row's result sits under its buttons; anything bigger (an entrant list, a
 * bingo board) goes in `children`, under the whole row.
 */

import type { ReactNode } from "react";

export function Levers({ children, label }: { children: ReactNode; label: string }) {
  return <div className="hub-levers" role="group" aria-label={label}>{children}</div>;
}

export function Lever({ label, hint, option, actions, status, children }: {
  label: string;
  /** A short note under the label ("Needs 2 in the lobby"). */
  hint?: ReactNode;
  /** The row's one choice (a CDS Select), or nothing. */
  option?: ReactNode;
  actions: ReactNode;
  /** The latest result or state ("→ Heads", "3 from chat"). */
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="hub-lever">
      <div className="hub-lever__label">
        <span className="hub-lever__name">{label}</span>
        {hint && <span className="hub-lever__hint">{hint}</span>}
      </div>
      <div className="hub-lever__option">{option}</div>
      <div className="hub-lever__actions">{actions}</div>
      {status && <div className="hub-lever__status" aria-live="polite">{status}</div>}
      {children && <div className="hub-lever__more">{children}</div>}
    </div>
  );
}
