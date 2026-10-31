"use client";

/**
 * Swiss settings (create form and manage page): rounds and top cut (from the
 * player count unless set), match length and the round clock, with one line
 * saying what that adds up to. Choice rows are CDS Buttons with aria-pressed,
 * the same as the create form's format row (CDS has no segmented switch yet).
 */

import { Button } from "@empac/cascadeds";
import { DECK_FORMATS, type DeckFormat } from "@/lib/tcg/deckList";
import { AFTER_CHOICES, WHEN_CHOICES, type DeckListAfter, type DeckListSettings, type DeckListWhen } from "@/lib/tournaments/deckLists";
import { SWISS_MIN_PLAYERS, describeStructure, structureFor, type BestOf, type SwissSettings, type TopCut } from "@/lib/tournaments/swiss";

function ChoiceRow<T extends string | number | null>({ label, value, choices, onPick, disabled }: {
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

export function SwissSettingsFields({ value, onChange, players, disabled }: {
  value: SwissSettings;
  onChange: (next: SwissSettings) => void;
  /** Confirmed players so far (the structure line uses 16 as an example until four have joined). */
  players: number;
  disabled?: boolean;
}) {
  const example = players < SWISS_MIN_PLAYERS;
  const count = example ? 16 : players;
  const auto = structureFor({ ...value, rounds: "auto", topCut: "auto" }, count);
  return (
    <div className="swiss-fields">
      <ChoiceRow<"auto" | number>
        label="Rounds"
        value={value.rounds}
        disabled={disabled}
        onPick={(rounds) => onChange({ ...value, rounds })}
        choices={[{ value: "auto", label: `By player count (${auto.rounds})` }, ...[3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))]}
      />
      <ChoiceRow<"auto" | TopCut>
        label="Top cut"
        value={value.topCut}
        disabled={disabled}
        onPick={(topCut) => onChange({ ...value, topCut })}
        choices={[{ value: "auto", label: `By player count (${auto.topCut ? `Top ${auto.topCut}` : "none"})` }, { value: 0, label: "None" }, { value: 4, label: "Top 4" }, { value: 8, label: "Top 8" }]}
      />
      <ChoiceRow<BestOf>
        label="Each match"
        value={value.bestOf}
        disabled={disabled}
        onPick={(bestOf) => onChange({ ...value, bestOf })}
        choices={[{ value: 1, label: "Best of 1" }, { value: 3, label: "Best of 3" }]}
      />
      <ChoiceRow<number | null>
        label="Round clock"
        value={value.roundMinutes}
        disabled={disabled}
        onPick={(roundMinutes) => onChange({ ...value, roundMinutes })}
        choices={[{ value: 25, label: "25 min" }, { value: 50, label: "50 min" }, { value: null, label: "None" }]}
      />
      <p className="swiss-fields__summary">
        <strong>With {count} players:</strong> {describeStructure(value, count)}
        {example && <span className="swiss-fields__muted"> (example until people join)</span>}
      </p>
    </div>
  );
}

export function DeckListSettingsFields({ value, onChange, swiss, disabled }: {
  value: DeckListSettings;
  onChange: (next: DeckListSettings) => void;
  swiss: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="swiss-fields swiss-fields--decks">
      <ChoiceRow<DeckListWhen> label="When players send their list" value={value.when} disabled={disabled} onPick={(when) => onChange({ ...value, when })} choices={WHEN_CHOICES} />
      {value.when !== "off" && (
        <>
          <ChoiceRow<DeckFormat> label="Format" value={value.format} disabled={disabled} onPick={(format) => onChange({ ...value, format })} choices={DECK_FORMATS} />
          <p className="swiss-fields__help">
            {value.format === "standard"
              ? "Standard lists are checked as they're sent: 60 cards, up to 4 of a card, one ACE SPEC, the regulation marks in play. Cards we can't match are marked for you to look at, never refused."
              : value.format === "expanded"
                ? "We check the counts (60 cards, up to 4 of a card, one ACE SPEC), not the Expanded card pool, so look each list over."
                : "Any card goes. We check the counts: 60 cards, up to 4 of a card, one ACE SPEC."}
          </p>
          <ChoiceRow<DeckListAfter> label="After the event" value={value.after} disabled={disabled} onPick={(after) => onChange({ ...value, after })} choices={AFTER_CHOICES(swiss)} />
          <p className="swiss-fields__help">Until the event ends, only you, your co-organizers and each player see a list. Lists lock when the event starts.</p>
        </>
      )}
    </div>
  );
}
