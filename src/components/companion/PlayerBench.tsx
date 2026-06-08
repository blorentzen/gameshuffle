"use client";

/**
 * A player's bench row — five slots, horizontal. Extracted from the
 * old PlayerArea so the new side-by-side layout can compose
 * (bench, active row, bench) cleanly.
 */

import type { CSSProperties } from "react";
import { Slot } from "./Slot";
import { BENCH_POSITIONS, type PlayerId } from "@/lib/companion/types";
import { useSession } from "@/lib/companion/SessionContext";

interface Props {
  player: PlayerId;
}

export function PlayerBench({ player }: Props) {
  const { state } = useSession();
  // Game settings cap the visible bench size — e.g. Sudden death
  // renders only 3 bench slots. The data model still has 5 slot
  // rows; hidden positions stay empty. The `--bench-size` CSS var
  // drives the grid column count so the row redistributes naturally.
  const positions = BENCH_POSITIONS.slice(0, state.gameSettings.benchSize);
  const style = { "--bench-size": positions.length } as CSSProperties;
  return (
    <div
      className={`companion-player-bench companion-player-bench--${player}`}
      style={style}
    >
      {positions.map((pos) => (
        <Slot key={pos} player={player} position={pos} emphasis="bench" />
      ))}
    </div>
  );
}
