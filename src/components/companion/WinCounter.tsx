"use client";

/**
 * Per-player win-resource counter. Pokémon Mode: prize cards (down
 * from 6). Manual +/− controls in Wave 1; Wave 2 wires the auto-
 * decrement-on-KO flow to the slot's `koValue`.
 */

import { useSession, useMode } from "@/lib/companion/SessionContext";
import type { PlayerId } from "@/lib/companion/types";

interface Props {
  player: PlayerId;
}

export function WinCounter({ player }: Props) {
  const { state, dispatch } = useSession();
  const mode = useMode();
  const value = state.winCounters[player];

  // For "down" counters, -1 means "took a prize", +1 means an undo.
  // For "up" counters (Lorcana etc.) the polarity is flipped at the
  // dispatch site so the UI buttons stay consistent ("− takes / +
  // gives back").
  const direction = mode.winCounterDirection;
  const takeDelta = direction === "down" ? -1 : 1;
  const undoDelta = -takeDelta;

  return (
    <div className="companion-win">
      <div className="companion-win__label">{mode.winCounterLabel}</div>
      <div className="companion-win__row">
        <button
          type="button"
          className="companion-win__btn"
          onClick={() => dispatch({ type: "ADJUST_WIN_COUNTER", player, delta: undoDelta })}
          aria-label="Undo (return one)"
        >
          +
        </button>
        <div className="companion-win__value" aria-live="polite">
          {value}
        </div>
        <button
          type="button"
          className="companion-win__btn"
          onClick={() => dispatch({ type: "ADJUST_WIN_COUNTER", player, delta: takeDelta })}
          aria-label="Take one"
        >
          −
        </button>
      </div>
    </div>
  );
}
