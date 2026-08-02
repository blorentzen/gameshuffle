"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { DicePips } from "@/components/companion/DicePips";

const COUNTS = [1, 2, 3, 4, 5, 6];

export function DiceRollerTool() {
  const [count, setCount] = useState(2);
  const [values, setValues] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);

  function roll() {
    setRolling(true);
    window.setTimeout(() => {
      setValues(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)));
      setRolling(false);
    }, 500);
  }

  const rolled = values.length > 0;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="tool-panel">
      <div className="dice-tool__controls">
        <span className="dice-tool__count" role="group" aria-label="Number of dice">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`dice-tool__count-btn${count === n ? " is-active" : ""}`}
              onClick={() => setCount(n)}
              aria-pressed={count === n}
            >
              {n}
            </button>
          ))}
        </span>
        <Button variant="primary" onClick={roll} disabled={rolling}>
          {rolling ? "Rolling…" : "Roll"}
        </Button>
      </div>

      <div className="dice-tool__faces" aria-live="polite">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className="dice-tool__die">
            <DicePips value={rolling ? null : values[i] ?? null} rolling={rolling} neutral={!rolling && !rolled} />
          </span>
        ))}
      </div>

      {rolled && count > 1 && !rolling && (
        <p className="dice-tool__total">
          Total: <strong>{total}</strong>
        </p>
      )}
    </div>
  );
}
