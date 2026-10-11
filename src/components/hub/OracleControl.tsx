"use client";

/**
 * OracleControl — Hub buttons for the oracle tools (8-Ball / Truth / Dare).
 * Each shows an answer card on the overlay via a server action. Self-hides for
 * non-Pro. (Yes/No stays chat-only — it wants a question.)
 */

import { useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
import { askEightBallAction, truthOrDareAction } from "@/app/hub/sessions/[slug]/actions";

export function OracleControl() {
  const [result, setResult] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const run = (fn: () => Promise<{ ok: boolean; answer?: string; error?: string }>) => {
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok && res.answer) {
        setResult(res.answer);
        window.setTimeout(() => setResult(null), 6000);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  return (
    <Lever
      label="8-ball, truth or dare"
      actions={
        <>
          <Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={() => run(askEightBallAction)}>Ask the 8-ball</Button>
          <Button variant="secondary" size="small" loading={pending} onClick={() => run(() => truthOrDareAction("truth"))}>Truth</Button>
          <Button variant="secondary" size="small" loading={pending} onClick={() => run(() => truthOrDareAction("dare"))}>Dare</Button>
        </>
      }
      status={result}
    />
  );
}
