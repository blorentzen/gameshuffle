"use client";

/**
 * CoinControl — Hub "Flip coin" button (Pro). Flips a coin onto the overlay via
 * the `flipCoinAction` server action. Self-hides for non-Pro. Mirrors DiceControl.
 */

import { useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
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
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
      <Button variant="primary" loading={pending} onClick={flip}>
        🪙 Flip coin
      </Button>
      {result ? (
        <span style={{ fontWeight: "var(--font-weight-semibold)" }}>→ {result}</span>
      ) : null}
    </div>
  );
}
