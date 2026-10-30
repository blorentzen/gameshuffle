import type { ReactNode } from "react";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { TtFilterSelect } from "./TtFilterSelect";
import { ITEMS, VEHICLES, vehiclesFor, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { TT_GAMES, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";

/**
 * The board filters in one row (round 2 tightening, 2A): the game when the page covers both, then
 * Mushrooms or No mushrooms and the speed class as two-way switches (CDS SubNav pills shown as a
 * track: CDS has no segmented control), then the vehicle board as a dropdown (Mario Kart 8 Deluxe).
 * Every choice is a link, so each board has its own address. `href` builds the address for a
 * combination on the page it's used on. `bare` leaves out the row so a board can add its own
 * controls at the end (whose times, the player count); `end` does the same here.
 */
export function TtCategoryNav({ game, cc, items, vehicle, href, games, bare = false, end }: {
  game: TtGame; cc: TtClass; items: TtItems; vehicle: TtVehicle;
  href: (c: { cc: TtClass; items: TtItems; vehicle: TtVehicle }) => string;
  /** The game switch, for pages that cover both games. */
  games?: { label: string; href: string; active: boolean }[];
  bare?: boolean;
  end?: ReactNode;
}) {
  const classes = TT_GAMES[game].classes;
  const vehicles = vehiclesFor(game);
  const parts = (
    <>
      {games && games.length > 1 && (
        <div className="tt-seg tt-seg--wide"><LabeledSubNav label="Game" variant="pills" items={games} /></div>
      )}
      <div className="tt-seg tt-seg--wide"><LabeledSubNav label="Items" variant="pills" items={ITEMS.map((i) => ({ label: i.label, href: href({ cc, items: i.id, vehicle }), active: i.id === items }))} /></div>
      {(classes.length > 1 || vehicles.length > 1) && (
        <div className="tt-filters__pair">
          {classes.length > 1 && (
            <div className="tt-seg"><LabeledSubNav label="Speed class" variant="pills" items={classes.map((c) => ({ label: `${c}cc`, href: href({ cc: c, items, vehicle }), active: c === cc }))} /></div>
          )}
          {vehicles.length > 1 && (
            <TtFilterSelect
              id="tt-vehicle"
              label="Vehicle board"
              className="tt-filters__vehicle"
              value={vehicle}
              options={VEHICLES.filter((v) => vehicles.includes(v.id)).map((v) => ({ value: v.id, label: v.id === "any" ? "Any vehicle" : v.label, href: href({ cc, items, vehicle: v.id }) }))}
            />
          )}
        </div>
      )}
    </>
  );
  if (bare) return parts;
  return <div className="tt-filters">{parts}{end && <div className="tt-filters__end">{end}</div>}</div>;
}
