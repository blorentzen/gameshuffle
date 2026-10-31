"use client";

/**
 * CoinControl — Hub "Flip coin" button (Pro). Flips a coin onto the overlay via
 * the `flipCoinAction` server action. Self-hides for non-Pro. Mirrors DiceControl.
 */

import { useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
import { flipCoinAction } from "@/app/hub/sessions/[slug]/actions";

export function CoinControl() {
  const [result, setResult] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const flip = () => {
    setResult(null);
    startTransition(async () => {
      const res = await flipCoinAction();
      if (res.ok && res.result) {
        setResult(res.result === "heads" ? "Heads" : "Tails");
        window.setTimeout(() => setResult(null), 6000);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  return (
    <Lever
      label="Coin"
      actions={<Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={flip}>Flip the coin</Button>}
      status={result ? <>It&rsquo;s <strong>{result}</strong></> : null}
    />
  );
}
