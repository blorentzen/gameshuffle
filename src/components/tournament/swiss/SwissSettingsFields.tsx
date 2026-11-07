"use client";

/**
 * Swiss settings (create form and manage page): rounds and top cut (from the
 * player count unless set), match length and the round clock, with one line
 * saying what that adds up to. Choice rows are CDS Buttons with aria-pressed,
 * the same as the create form's format row (CDS has no segmented switch yet).
 */

import { ChoiceRow } from "@/components/tournament/ChoiceRow";
import { DECK_FORMATS, type DeckFormat } from "@/lib/tcg/deckList";
import { AFTER_CHOICES, WHEN_CHOICES, type DeckListAfter, type DeckListSettings, type DeckListWhen } from "@/lib/tournaments/deckLists";
import { SWISS_MAX_ROUNDS, SWISS_MIN_PLAYERS, describeStructure, structureFor, type BestOf, type SwissSettings, type TopCut } from "@/lib/tournaments/swiss";
import { TtEventSettingsFields } from "@/components/tournament/tt/TtEventSettingsFields";
import type { TtEventSettings } from "@/lib/tournaments/tt/event";


export function SwissSettingsFields({ value, onChange, players, disabled, timeTrial }: {
  value: SwissSettings;
  onChange: (next: SwissSettings) => void;
  /** Confirmed players so far (the structure line uses 16 as an example until four have joined). */
  players: number;
  disabled?: boolean;
  /** Mario Kart once time trial events are switched on: matches can be decided by time on the event's tracks. */
  timeTrial?: { settings: TtEventSettings; onChange: (next: TtEventSettings) => void } | null;
}) {
  const example = players < SWISS_MIN_PLAYERS;
  const count = example ? 16 : players;
  const auto = structureFor({ ...value, rounds: "auto", topCut: "auto" }, count);
  return (
    <div className="swiss-fields">
      {(timeTrial || value.timeTrial) && (
        <ChoiceRow<"report" | "tt">
          label="Decide matches by"
          value={value.timeTrial ? "tt" : "report"}
          disabled={disabled || !timeTrial}
          onPick={(v) => onChange({ ...value, timeTrial: v === "tt" ? true : undefined })}
          choices={[{ value: "report", label: "Players report" }, { value: "tt", label: "Time trial" }]}
        />
      )}
      <ChoiceRow<"auto" | number>
        label="Rounds"
        value={value.rounds}
        disabled={disabled}
        onPick={(rounds) => onChange({ ...value, rounds })}
        choices={[{ value: "auto", label: `By player count (${auto.rounds})` }, ...Array.from({ length: SWISS_MAX_ROUNDS - 2 }, (_, i) => i + 3).map((n) => ({ value: n, label: String(n) }))]}
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
      {value.timeTrial && timeTrial && (
        <>
          <p className="tt-fields__help">Both players race the match&apos;s tracks and add their times with a screenshot. Best of 1 is one track; best of 3 is three, first to two. Each round takes the next tracks on your list.</p>
          <TtEventSettingsFields value={timeTrial.settings} onChange={timeTrial.onChange} players={players} disabled={disabled} part="board" />
        </>
      )}
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
