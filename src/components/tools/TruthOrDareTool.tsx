"use client";

import { useRef, useState } from "react";
import { Button } from "@empac/cascadeds";

type Kind = "truth" | "dare";

/** Pick a random item avoiding the one just shown (per-kind memory). */
function pickAvoiding(pool: string[], last: string | undefined): string {
  if (pool.length <= 1) return pool[0] ?? "";
  let next = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (next === last && guard++ < 12) {
    next = pool[Math.floor(Math.random() * pool.length)];
  }
  return next;
}

export function TruthOrDareTool({
  truths,
  dares,
}: {
  truths: string[];
  dares: string[];
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const lastTruth = useRef<string>(undefined);
  const lastDare = useRef<string>(undefined);

  function draw(which: Kind) {
    if (typeof window !== "undefined") window.plausible?.("Tool Used", { props: { tool: "truth-or-dare", kind: which } });
    const pool = which === "truth" ? truths : dares;
    const last = which === "truth" ? lastTruth.current : lastDare.current;
    const next = pickAvoiding(pool, last);
    if (which === "truth") lastTruth.current = next;
    else lastDare.current = next;
    setKind(which);
    setPrompt(next);
  }

  function drawRandom() {
    draw(Math.random() < 0.5 ? "truth" : "dare");
  }

  return (
    <div className="tool-panel tod-tool">
      <div className="tod-tool__buttons">
        <Button variant="primary" onClick={() => draw("truth")}>Truth</Button>
        <Button variant="primary" onClick={() => draw("dare")}>Dare</Button>
        <Button variant="secondary" onClick={drawRandom}>Random</Button>
      </div>

      {prompt && kind && (
        <div className={`tod-card tod-card--${kind}`} aria-live="polite">
          <span className="tod-card__kind">{kind}</span>
          <p className="tod-card__prompt">{prompt}</p>
        </div>
      )}

      {prompt && (
        <Button variant="ghost" size="small" onClick={() => (kind ? draw(kind) : drawRandom())}>
          Another {kind}
        </Button>
      )}
    </div>
  );
}
