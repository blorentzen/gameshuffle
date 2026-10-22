"use client";

import { useRef, useState } from "react";
import { Button } from "@empac/cascadeds";
import { ToolLayout } from "@/components/tools/ToolLayout";
import { TruthOrDarePicker } from "@/components/tools/TruthOrDarePicker";

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

export function TruthOrDareTool({ truths, dares, currentSlug }: { truths: string[]; dares: string[]; currentSlug?: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const lastTruth = useRef<string>(undefined);
  const lastDare = useRef<string>(undefined);

  function draw(which: Kind) {
    window.plausible?.("Tool Used", { props: { tool: "truth-or-dare", kind: which } });
    const pool = which === "truth" ? truths : dares;
    const last = which === "truth" ? lastTruth.current : lastDare.current;
    const next = pickAvoiding(pool, last);
    if (which === "truth") lastTruth.current = next;
    else lastDare.current = next;
    setKind(which);
    setPrompt(next);
  }

  const stage = (
    <>
      <div className={`tod-card${kind ? ` tod-card--${kind}` : " tod-card--idle"}`} aria-live="polite">
        {prompt && kind ? (
          <>
            <span className="tod-card__kind">{kind}</span>
            <p className="tod-card__prompt">{prompt}</p>
          </>
        ) : (
          <p className="tod-card__prompt">Truth or dare?</p>
        )}
      </div>
      <div className="tool-stage__action tod-tool__buttons">
        <Button variant="primary" size="large" onClick={() => draw("truth")}>Truth</Button>
        <Button variant="primary" size="large" onClick={() => draw("dare")}>Dare</Button>
        <Button variant="secondary" size="large" onClick={() => draw(Math.random() < 0.5 ? "truth" : "dare")}>Random</Button>
      </div>
    </>
  );

  return <ToolLayout className="tod-tool" stage={stage} settings={<TruthOrDarePicker currentSlug={currentSlug} />} settingsLabel="Truth or dare sets" />;
}
