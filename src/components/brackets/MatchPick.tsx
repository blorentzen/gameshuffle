"use client";

/**
 * One match's result as three CDS Buttons: either player, or a tie when ties
 * count. The chosen one is primary (aria-pressed); pressing it again takes the
 * result back. Used by the round robin and Swiss tools.
 */

import { Button } from "@empac/cascadeds";

export type Outcome = "a" | "b" | "t";

export function MatchPick({ label, a, b, value, ties, onChange, disabled }: {
  /** "Round 2, match 3" or "Table 4", for screen readers. */
  label: string;
  a: string;
  b: string;
  value: Outcome | null;
  ties: boolean;
  onChange?: (next: Outcome | null) => void;
  disabled?: boolean;
}) {
  const press = (o: Outcome) => onChange?.(value === o ? null : o);
  const readOnly = !onChange || disabled;
  return (
    <div className="bt-pick" role="group" aria-label={`${label}: ${a} against ${b}`}>
      <Button size="small" variant={value === "a" ? "primary" : "secondary"} aria-pressed={value === "a"} disabled={readOnly} onClick={() => press("a")} className="bt-pick__name">{a}</Button>
      <span className="bt-pick__vs" aria-hidden>vs</span>
      <Button size="small" variant={value === "b" ? "primary" : "secondary"} aria-pressed={value === "b"} disabled={readOnly} onClick={() => press("b")} className="bt-pick__name">{b}</Button>
      {(ties || value === "t") && (
        <Button size="small" variant={value === "t" ? "primary" : "ghost"} aria-pressed={value === "t"} disabled={readOnly} onClick={() => press("t")}>Tie</Button>
      )}
    </div>
  );
}

/** The result in words, for the printed sheet and read-only rounds. */
export function outcomeText(o: Outcome | null, a: string, b: string): string {
  return o === "a" ? `${a} won` : o === "b" ? `${b} won` : o === "t" ? "Tie" : "Not played";
}
