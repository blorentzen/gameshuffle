"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";

export function CoinFlipTool() {
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [tally, setTally] = useState({ heads: 0, tails: 0 });

  function flip() {
    if (flipping) return;
    setFlipping(true);
    const r: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    // Land on 0deg (heads) or 180deg (tails) after several full spins.
    const target = rotation - (rotation % 360) + 5 * 360 + (r === "tails" ? 180 : 0);
    setRotation(target);
    window.setTimeout(() => {
      setResult(r);
      setTally((t) => ({ ...t, [r]: t[r] + 1 }));
      setFlipping(false);
    }, 780);
  }

  return (
    <div className="tool-panel">
      <div className="coin-tool__stage">
        <div className="coin-tool__coin" style={{ transform: `rotateY(${rotation}deg)` }} aria-hidden="true">
          <span className="coin-tool__face coin-tool__face--heads">Heads</span>
          <span className="coin-tool__face coin-tool__face--tails">Tails</span>
        </div>
      </div>

      <Button variant="primary" onClick={flip} disabled={flipping}>
        {flipping ? "Flipping…" : "Flip coin"}
      </Button>

      <p className="coin-tool__result" aria-live="polite">
        {result && !flipping ? (
          <>
            It&apos;s <strong>{result}</strong>!
          </>
        ) : (
          " "
        )}
      </p>
      {tally.heads + tally.tails > 0 && (
        <p className="coin-tool__tally">
          Heads {tally.heads} · Tails {tally.tails}
        </p>
      )}
    </div>
  );
}
