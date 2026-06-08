"use client";

/**
 * Dice utility — center band entry point.
 *
 * Wave 3 polish: the roll happens inside a dialog so the result has
 * presence. This button is now just the at-a-glance latest result +
 * history strip; tapping opens DiceRollModal which animates, reveals,
 * and offers "Roll again" / face picker / "Close".
 *
 * For d6 the button face shows canonical pips so it actually reads
 * as a die at a glance. Other face counts (a future d10/d20 mode)
 * fall back to a digit since there's no canonical pip layout.
 */

import { useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { DiceRollModal } from "./DiceRollModal";
import { DicePips } from "./DicePips";

export function Dice() {
  const { state } = useSession();
  const mode = useMode();
  const [open, setOpen] = useState(false);
  const [openNonce, setOpenNonce] = useState(0);

  if (!mode.diceEnabled) return null;

  const latest = state.diceHistory[0];

  const handleOpen = () => {
    setOpenNonce((n) => n + 1);
    setOpen(true);
  };

  // Center-band button always renders a pip face when d6 is the
  // default (Pokémon Mode). With no roll yet, we show a blank face
  // — the button shape is still recognizable as a die and the
  // aria-label tells assistive tech what tapping will do.
  const usePipsButton =
    mode.diceFaceDefault === 6 && (latest ? latest.faces === 6 : true);

  return (
    <div className="companion-dice">
      <button
        type="button"
        className={`companion-dice__face${
          usePipsButton ? " companion-dice__face--pips" : ""
        }`}
        onClick={handleOpen}
        aria-label={
          latest
            ? `Last roll: ${latest.result}. Tap to roll d${mode.diceFaceDefault}.`
            : `Roll d${mode.diceFaceDefault}`
        }
      >
        {usePipsButton ? (
          <DicePips
            value={latest ? latest.result : null}
            neutral={!latest}
            ariaLabel={latest ? `Last roll: ${latest.result}` : "Tap to roll"}
          />
        ) : (
          <span className="companion-dice__face-fallback">
            {latest ? latest.result : `d${mode.diceFaceDefault}`}
          </span>
        )}
      </button>
      <ol className="companion-dice__history" aria-label="Recent rolls">
        {state.diceHistory.map((entry) => (
          <li key={entry.id} className="companion-dice__history-item">
            {entry.result}
          </li>
        ))}
      </ol>

      <DiceRollModal
        key={`dice-${openNonce}`}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
