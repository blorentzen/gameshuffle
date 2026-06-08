"use client";

/**
 * Dice roll dialog — same structural pattern as CoinFlipModal:
 *
 *   - Outer modal owns `faces` + `rollCount`.
 *   - Each roll is a fresh `DiceRollBody` mount (key bumps on
 *     rollCount or faces change), so the RNG is computed once per
 *     mount via useState's lazy initializer and the reveal timer
 *     only sets a boolean inside its callback.
 *
 * Pokémon Mode ships d6 only; if a future mode lists multiple sizes,
 * the in-modal picker re-rolls when the face count changes.
 */

import { Modal } from "@empac/cascadeds";
import { useEffect, useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { rollDie } from "@/lib/companion/rng";
import { DicePips } from "./DicePips";

const ANIM_MS = 900;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DiceRollModal({ isOpen, onClose }: Props) {
  const mode = useMode();
  const [faces, setFaces] = useState<number>(mode.diceFaceDefault);
  const [rollCount, setRollCount] = useState(0);
  // `reveal` is the rolled value or null. We pass `setReveal` directly
  // to the child's `onReveal` so its identity stays stable across
  // renders — otherwise an inline arrow re-triggers the child's
  // useEffect and schedules a second timer → double-logged dice roll.
  const [reveal, setReveal] = useState<number | null>(null);

  const handleRollAgain = () => {
    setReveal(null);
    setRollCount((n) => n + 1);
  };

  const handlePickFaces = (n: number) => {
    if (n === faces) return;
    setReveal(null);
    setFaces(n);
    setRollCount((c) => c + 1);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dice roll">
      <DiceRollBody
        key={`roll-${faces}-${rollCount}`}
        faces={faces}
        onReveal={setReveal}
      />

      {mode.diceFaceOptions.length > 1 && (
        <div className="companion-dice-modal__picker">
          {mode.diceFaceOptions.map((n) => (
            <button
              key={n}
              type="button"
              className={`companion-dice-modal__picker-btn${
                faces === n ? " companion-dice-modal__picker-btn--selected" : ""
              }`}
              onClick={() => handlePickFaces(n)}
              disabled={reveal == null}
            >
              d{n}
            </button>
          ))}
        </div>
      )}

      <div className="companion-dice-modal__actions">
        <button
          type="button"
          className="companion-dice-modal__btn companion-dice-modal__btn--secondary"
          onClick={onClose}
          disabled={reveal == null}
        >
          Close
        </button>
        <button
          type="button"
          className="companion-dice-modal__btn companion-dice-modal__btn--primary"
          onClick={handleRollAgain}
          disabled={reveal == null}
        >
          Roll again
        </button>
      </div>
    </Modal>
  );
}

interface BodyProps {
  faces: number;
  onReveal: (value: number) => void;
}

function DiceRollBody({ faces, onReveal }: BodyProps) {
  const { dispatch } = useSession();
  // Pure-React idiom: useState's lazy initializer runs exactly once
  // per mount, so the RNG fires once and the rendered result is
  // stable across re-renders.
  const [value] = useState<number>(() => rollDie(faces));
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      dispatch({ type: "LOG_DICE_ROLL", faces, result: value });
      setSettled(true);
      onReveal(value);
    }, ANIM_MS);
    return () => clearTimeout(t);
  }, [dispatch, faces, value, onReveal]);

  // d6 gets the canonical pip face. Larger dice (a future mode might
  // ship d10/d20) fall back to the digit display since there's no
  // canonical pip layout above 6.
  const usePips = faces === 6;

  return (
    <div className="companion-dice-modal">
      <div
        className={`companion-dice-modal__face${
          settled ? "" : " companion-dice-modal__face--rolling"
        }${usePips ? " companion-dice-modal__face--pips" : ""}`}
      >
        {usePips ? (
          <DicePips
            value={value}
            rolling={!settled}
            ariaLabel={settled ? `Die showing ${value}` : "Die rolling"}
          />
        ) : (
          <span className="companion-dice-modal__value">
            {settled ? value : "?"}
          </span>
        )}
      </div>
      <p className="companion-dice-modal__caption" aria-live="polite">
        {settled ? `You rolled ${value}.` : "Rolling…"}
      </p>
    </div>
  );
}
