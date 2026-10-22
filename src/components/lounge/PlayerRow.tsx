import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { divisionLook } from "@/lib/mmr/look";
import { MMR_GAMES } from "@/lib/mmr/rules";
import { countryName } from "@/lib/lounge/countries";
import { suggestionLine, type Suggestion } from "@/lib/lounge/lookup";

/**
 * One lounge player as a row (lookup picks, 2026-10-21): the division emblem, the name and country,
 * "Division · MMR · #rank in <game>", and a small tag for every game they played this season. The
 * row's content only; the search's list wraps it in an option, "Did you mean" in a link. Server-safe.
 */
export function PlayerRowBody({ s }: { s: Suggestion }) {
  return (
    <>
      <span className="lounge-prow__emblem" aria-hidden="true"><MmrEmblem d={divisionLook(s.played ? s.primary.division ?? "Placement" : "Placement")} frame="tile" /></span>
      <span className="lounge-prow__main">
        <span className="lounge-prow__name">
          <b>{s.name}</b>
          {s.country && <span className="lounge-prow__country">{countryName(s.country)}</span>}
        </span>
        <span className="lounge-prow__meta">{suggestionLine(s)}</span>
      </span>
      {s.games.length > 0 && (
        <span className="lounge-prow__tags">
          <span className="sr-only">Plays </span>
          {s.games.map((g, i) => <span key={g} className="lounge-tag">{MMR_GAMES[g].short}{i < s.games.length - 1 ? <span className="sr-only">, </span> : null}</span>)}
        </span>
      )}
    </>
  );
}
