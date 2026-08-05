"use client";

/**
 * DiceControl — Hub "Roll dice" button (Pro). Rolls N dice onto the overlay via
 * the `rollDiceAction` server action (streamer's colors). Self-hides for non-Pro
 * (the action returns `pro_required`). Mirrors WheelControl.
 */

import { useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import { rollDiceAction } from "@/app/hub/sessions/[slug]/actions";

const COUNTS = [1, 2, 3, 4, 5, 6];

export function DiceControl() {
  const [count, setCount] = useState(2);
  const [result, setResult] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const roll = () => {
    setResult(null);
    startTransition(async () => {
      const res = await rollDiceAction(count);
      if (res.ok && res.values) {
        setResult(
          res.values.length > 1 ? `${res.values.join(" + ")} = ${res.total}` : String(res.values[0]),
        );
        window.setTimeout(() => setResult(null), 6000);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
      <select
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        aria-label="Number of dice"
        style={{
          height: 36,
          borderRadius: "var(--radius-8, 0.5rem)",
          border: "1px solid var(--border-default)",
          padding: "0 var(--spacing-8)",
          background: "var(--surface-default)",
          color: "var(--text-primary)",
        }}
      >
        {COUNTS.map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "die" : "dice"}
          </option>
        ))}
      </select>
      <Button variant="primary" loading={pending} onClick={roll}>
        🎲 Roll dice
      </Button>
      {result ? (
        <span style={{ fontWeight: "var(--font-weight-semibold)" }}>→ {result}</span>
      ) : null}
    </div>
  );
}
