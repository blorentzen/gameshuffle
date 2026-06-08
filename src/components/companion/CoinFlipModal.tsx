"use client";

/**
 * Coin flip dialog — opens when the center-band Coin button is
 * tapped. Each "flip" is a fresh mount of `CoinFlipBody` (via the
 * `flipCount` key) so the RNG runs once per mount via useState's
 * lazy initializer, and the reveal timer just sets one boolean
 * inside its callback (no synchronous state resets in the effect
 * body — React 19 purity rules).
 *
 * The result is logged to the shared history on REVEAL, not at
 * flip-start, so the history strip doesn't spoil the animation.
 * If the dialog unmounts mid-flight, the dispatch still fires (the
 * flip happened the moment the user tapped Flip).
 */

import { Modal } from "@empac/cascadeds";
import { useEffect, useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { flipCoin } from "@/lib/companion/rng";
import { Coin3D } from "./Coin3D";
import type { CoinFlipEntry } from "@/lib/companion/types";

const ANIM_MS = 1200;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CoinFlipModal({ isOpen, onClose }: Props) {
  const [flipCount, setFlipCount] = useState(0);
  // Reveal state is a plain `side | null` so we can pass the state
  // setter directly to the child's `onReveal` prop — keeping its
  // identity stable across renders. An inline arrow used to thrash
  // the child's `useEffect` deps and schedule a second timer →
  // double-dispatched coin flip on every flip.
  const [revealedSide, setRevealedSide] = useState<
    CoinFlipEntry["side"] | null
  >(null);

  const handleFlipAgain = () => {
    setRevealedSide(null);
    setFlipCount((n) => n + 1);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Coin flip">
      <CoinFlipBody key={`flip-${flipCount}`} onReveal={setRevealedSide} />
      <CoinFlipActions
        canRollAgain={revealedSide != null}
        onClose={onClose}
        onFlipAgain={handleFlipAgain}
      />
    </Modal>
  );
}

interface BodyProps {
  onReveal: (side: CoinFlipEntry["side"]) => void;
}

function CoinFlipBody({ onReveal }: BodyProps) {
  const { dispatch } = useSession();
  const mode = useMode();
  // RNG runs exactly once per mount, courtesy of useState's lazy
  // initializer — pure-React idiom for "compute once on mount".
  const [side] = useState<CoinFlipEntry["side"]>(() =>
    flipCoin() === 0 ? "a" : "b",
  );
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      // Log first so a mid-flight close still records the flip.
      dispatch({ type: "LOG_COIN_FLIP", side });
      setSettled(true);
      onReveal(side);
    }, ANIM_MS);
    return () => clearTimeout(t);
  }, [dispatch, side, onReveal]);

  const label = side === "a" ? mode.coinLabels.a : mode.coinLabels.b;

  return (
    <div className="companion-coin-modal">
      <div className="companion-coin-modal__stage">
        <Coin3D resultSide={side} phase={settled ? "settled" : "flipping"} />
      </div>
      <p className="companion-coin-modal__caption" aria-live="polite">
        {settled ? `${label}!` : "Flipping…"}
      </p>
    </div>
  );
}

function CoinFlipActions({
  canRollAgain,
  onClose,
  onFlipAgain,
}: {
  canRollAgain: boolean;
  onClose: () => void;
  onFlipAgain: () => void;
}) {
  return (
    <div className="companion-coin-modal__actions">
      <button
        type="button"
        className="companion-coin-modal__btn companion-coin-modal__btn--secondary"
        onClick={onClose}
        disabled={!canRollAgain}
      >
        Close
      </button>
      <button
        type="button"
        className="companion-coin-modal__btn companion-coin-modal__btn--primary"
        onClick={onFlipAgain}
        disabled={!canRollAgain}
      >
        Flip again
      </button>
    </div>
  );
}
