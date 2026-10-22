"use client";

/**
 * DiceControl — Hub "Roll dice" button (Pro). Rolls N dice onto the overlay via
 * the `rollDiceAction` server action, in the streamer's dice look. The count
 * starts at the look's default (Tool looks or the free dice page); a Full mod
 * gets the streamer's. Self-hides for non-Pro (the action returns
 * `pro_required`). Mirrors WheelControl.
 */

import { useState, useTransition } from "react";
import { Button, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
import { rollDiceAction } from "@/app/hub/sessions/[slug]/actions";
import { useToolLook } from "@/components/tools/looks/useToolLook";

const COUNTS = [1, 2, 3, 4, 5, 6];

export function DiceControl() {
  const { look } = useToolLook("dice", { forStream: true });
  const [picked, setPicked] = useState<number | null>(null);
  const count = picked ?? look.defaultCount;
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
          onChange={(v) => setPicked(Number(v))}
          options={COUNTS.map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "die" : "dice"}` }))}
        />
      }
      actions={<Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={roll}>Roll the dice</Button>}
      status={result ? <>Rolled <strong>{result}</strong></> : null}
    />
  );
}
