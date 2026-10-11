"use client";

/**
 * DiceControl — Hub "Roll dice" button (Pro). Rolls N dice onto the overlay via
 * the `rollDiceAction` server action (streamer's colors). Self-hides for non-Pro
 * (the action returns `pro_required`). Mirrors WheelControl.
 */

import { useState, useTransition } from "react";
import { Button, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
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
    <Lever
      label="Dice"
      option={
        <Select
          size="small"
          aria-label="Number of dice"
          value={String(count)}
          onChange={(v) => setCount(Number(v))}
          options={COUNTS.map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "die" : "dice"}` }))}
        />
      }
      actions={<Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={roll}>Roll the dice</Button>}
      status={result ? <>Rolled <strong>{result}</strong></> : null}
    />
  );
}
