"use client";

/**
 * "Decide matches by" for single and double elimination (builder picks: TT matches in brackets): the organizer picks
 * each winner as now, or the two players' times on the match's tracks decide it. With time trial on, matches are 1v1
 * (groups of more are the Time trial format) and the board and tracks come from the time trial fields.
 */

import { ChoiceRow } from "@/components/tournament/ChoiceRow";
import { TtEventSettingsFields } from "./TtEventSettingsFields";
import type { TtEventSettings } from "@/lib/tournaments/tt/event";
import type { TtBestOf } from "@/lib/tournaments/tt/bracketTt";

export function TtBracketFields({ on, bestOf, settings, onOn, onBestOf, onSettings, players, disabled }: {
  on: boolean;
  bestOf: TtBestOf;
  settings: TtEventSettings;
  onOn: (on: boolean) => void;
  onBestOf: (b: TtBestOf) => void;
  onSettings: (next: TtEventSettings) => void;
  players: number;
  disabled?: boolean;
}) {
  return (
    <div className="swiss-fields">
      <ChoiceRow<"pick" | "tt">
        label="Decide matches by"
        value={on ? "tt" : "pick"}
        disabled={disabled}
        onPick={(v) => onOn(v === "tt")}
        choices={[{ value: "pick", label: "Organizer reports" }, { value: "tt", label: "Time trial" }]}
      />
      {on && (
        <>
          <ChoiceRow<TtBestOf>
            label="Each match"
            value={bestOf}
            disabled={disabled}
            onPick={onBestOf}
            choices={[{ value: 1, label: "Best of 1" }, { value: 3, label: "Best of 3" }]}
          />
          <p className="tt-fields__help">
            Both players race the match&apos;s tracks and add their times with a screenshot. The faster time takes each track, and the
            bracket moves on by itself once a match is decided. Every open match runs at the same time. Each round takes the next
            {bestOf === 3 ? " three tracks" : " track"} on your list.
          </p>
          <TtEventSettingsFields value={settings} onChange={onSettings} players={players} disabled={disabled} part="board" />
        </>
      )}
    </div>
  );
}
