"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox } from "@empac/cascadeds";

type Result = "yes" | "no" | "maybe";

export function YesNoTool() {
  const [allowMaybe, setAllowMaybe] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [tally, setTally] = useState({ yes: 0, no: 0 });
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearInterval(flashTimer.current);
    };
  }, []);

  function decide() {
    if (spinning) return;
    setSpinning(true);
    const pool: Result[] = allowMaybe ? ["yes", "no", "maybe"] : ["yes", "no"];

    // Flash through options, then settle on the final pick.
    if (flashTimer.current) window.clearInterval(flashTimer.current);
    flashTimer.current = window.setInterval(() => {
      setResult(pool[Math.floor(Math.random() * pool.length)]);
    }, 70);

    window.setTimeout(() => {
      if (flashTimer.current) window.clearInterval(flashTimer.current);
      const final = pool[Math.floor(Math.random() * pool.length)];
      setResult(final);
      setSpinning(false);
      if (final === "yes" || final === "no") {
        setTally((t) => ({ ...t, [final]: t[final] + 1 }));
      }
    }, 1100);
  }

  const label = result ? result.toUpperCase() : "?";

  return (
    <div className="tool-panel yesno-tool">
      <button
        type="button"
        className={`yesno-face${result ? ` yesno-face--${result}` : ""}${spinning ? " is-spinning" : ""}`}
        onClick={decide}
        aria-label="Get a yes or no answer"
        aria-live="polite"
      >
        {label}
      </button>

      <Button variant="primary" onClick={decide} disabled={spinning}>
        {spinning ? "Deciding…" : result ? "Again" : "Decide"}
      </Button>

      <div className="yesno-tool__opts">
        <Checkbox
          label="Allow &ldquo;Maybe&rdquo;"
          checked={allowMaybe}
          onChange={(e) => setAllowMaybe(e.target.checked)}
        />
      </div>

      {(tally.yes > 0 || tally.no > 0) && (
        <p className="yesno-tool__tally">
          Yes: {tally.yes} &nbsp;·&nbsp; No: {tally.no}
        </p>
      )}
    </div>
  );
}
