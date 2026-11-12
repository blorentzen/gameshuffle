"use client";

/**
 * Team races and duels (co-op pick 6): when making a race or a duel, the host can split the room into 2 to 4 teams
 * (players pick theirs in the lobby) and choose how a team scores: every member's result added up, or its best one.
 */

import { Chip } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import type { TeamScore } from "@/lib/versus/types";

export interface TeamChoice { count: number; score: TeamScore }

export function TeamOptions({ id, value, onChange, max, unit }: {
  id: string;
  value: TeamChoice;
  onChange: (v: TeamChoice) => void;
  /** The room's size: never more teams than players. */
  max: number;
  /** What a result is: a time or turns. */
  unit: "time" | "turns";
}) {
  const options = [{ value: "0", label: "No teams" }, ...[2, 3, 4].filter((n) => n <= max).map((n) => ({ value: String(n), label: `${n} teams` }))];
  return (
    <div className="team-opts">
      <Select id={`${id}-teams`} floatingLabel="Teams" fullWidth value={String(value.count)} onChange={(v) => onChange({ ...value, count: Number(v) })} options={options} />
      {value.count > 0 && (
        <div className="team-opts__row" role="group" aria-labelledby={`${id}-score`}>
          <span id={`${id}-score`} className="team-opts__label">A team scores</span>
          <div className="team-opts__chips">
            <Chip clickable selected={value.score === "total"} onClick={() => onChange({ ...value, score: "total" })} label={unit === "time" ? "Everyone's times added up" : "Everyone's turns added up"} />
            <Chip clickable selected={value.score === "best"} onClick={() => onChange({ ...value, score: "best" })} label={unit === "time" ? "Its fastest runner" : "Its best player"} />
          </div>
          <p className="team-opts__note">Players pick a team in the room before the start.{value.score === "total" ? " A team's total needs everyone on it to finish." : ""}</p>
        </div>
      )}
    </div>
  );
}
