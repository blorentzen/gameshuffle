"use client";

/**
 * Coin flip utility — center band entry point.
 *
 * Wave 3 polish: the flip happens inside a dialog so the result has
 * presence. This button is now just the at-a-glance latest result +
 * history strip; tapping opens the CoinFlipModal which runs the
 * animation, reveals the result, and gives "Flip again" / "Close".
 *
 * The button face uses the same shared CoinFace component as the
 * modal so a tester sees the Poké Ball / Great Ball design at a
 * glance. With no flip yet, the button shows the heads-side design
 * as a "pick me up" affordance.
 */

import { useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { CoinFlipModal } from "./CoinFlipModal";
import { CoinFace } from "./CoinFace";

export function CoinFlip() {
  const { state } = useSession();
  const mode = useMode();
  const [open, setOpen] = useState(false);
  /** Bumped every time the modal opens so it remounts with a fresh
   *  flip cycle — see CoinFlipModal docstring. */
  const [openNonce, setOpenNonce] = useState(0);

  if (!mode.coinFlipEnabled) return null;

  const latest = state.coinHistory[0];
  const displaySide = latest?.side ?? "a";

  const handleOpen = () => {
    setOpenNonce((n) => n + 1);
    setOpen(true);
  };

  return (
    <div className="companion-coin">
      <button
        type="button"
        className="companion-coin__face"
        onClick={handleOpen}
        aria-label={
          latest
            ? `Last flip: ${latest.side === "a" ? mode.coinLabels.a : mode.coinLabels.b}. Tap to flip again.`
            : "Flip coin"
        }
      >
        <CoinFace side={displaySide} />
      </button>
      <ol className="companion-coin__history" aria-label="Recent flips">
        {state.coinHistory.map((entry) => (
          <li
            key={entry.id}
            className={`companion-coin__history-item companion-coin__history-item--${entry.side}`}
          >
            {entry.side === "a" ? mode.coinLabels.a[0] : mode.coinLabels.b[0]}
          </li>
        ))}
      </ol>

      <CoinFlipModal
        key={`coin-${openNonce}`}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
