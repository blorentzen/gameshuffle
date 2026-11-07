"use client";

/**
 * A row of choices as CDS Buttons with aria-pressed (CDS has no segmented switch yet): the Swiss and time trial
 * settings use it, the same as the create form's format row.
 */

import { Button } from "@empac/cascadeds";

export function ChoiceRow<T extends string | number | null>({ label, value, choices, onPick, disabled }: {
  label: string; value: T; choices: { value: T; label: string }[]; onPick: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="swiss-fields__row" role="group" aria-label={label}>
      <span className="swiss-fields__label">{label}</span>
      <div className="swiss-fields__choices">
        {choices.map((c) => (
          <Button key={String(c.value)} size="small" variant={c.value === value ? "primary" : "secondary"} aria-pressed={c.value === value} disabled={disabled} onClick={() => onPick(c.value)}>
            {c.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
