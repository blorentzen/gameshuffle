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
import { useEffect, useRef, useState } from "react";
import { useMode, useSession, type DieResult } from "@/lib/companion/SessionContext";
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
  const { dispatch, random } = useSession();
  // One roll per mount (the ref survives React's dev double-run of effects).
  // In a shared game the server rolls and logs it for both phones.
  const [result, setResult] = useState<DieResult | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void random.die(faces).then(setResult);
  }, [random, faces]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      if (!result.logged) dispatch({ type: "LOG_DICE_ROLL", faces, result: result.value });
      setSettled(true);
      onReveal(result.value);
    }, ANIM_MS);
    return () => clearTimeout(t);
  }, [dispatch, faces, result, onReveal]);
  const value = result?.value ?? 1;

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
