"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Switch } from "@empac/cascadeds";
import { ToolLayout } from "@/components/tools/ToolLayout";

type Result = "yes" | "no" | "maybe";

export function YesNoTool() {
  const [allowMaybe, setAllowMaybe] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [tally, setTally] = useState({ yes: 0, no: 0 });
  const flashTimer = useRef<number | null>(null);

  useEffect(() => () => { if (flashTimer.current) window.clearInterval(flashTimer.current); }, []);

  function decide() {
    if (spinning) return;
    window.plausible?.("Tool Used", { props: { tool: "yes-no" } });
    setSpinning(true);
    const pool: Result[] = allowMaybe ? ["yes", "no", "maybe"] : ["yes", "no"];

    // Flash through the answers, then settle on the final pick.
    if (flashTimer.current) window.clearInterval(flashTimer.current);
    flashTimer.current = window.setInterval(() => {
      setResult(pool[Math.floor(Math.random() * pool.length)]);
    }, 70);

    window.setTimeout(() => {
      if (flashTimer.current) window.clearInterval(flashTimer.current);
      const final = pool[Math.floor(Math.random() * pool.length)];
      setResult(final);
      setSpinning(false);
      if (final === "yes" || final === "no") setTally((t) => ({ ...t, [final]: t[final] + 1 }));
    }, 1100);
  }

  const label = result ? result.toUpperCase() : "?";

  const stage = (
    <>
      <button
        type="button"
        className={`yesno-face${result ? ` yesno-face--${result}` : ""}${spinning ? " is-spinning" : ""}`}
        onClick={decide}
        aria-label="Get a yes or no answer"
      >
        {label}
      </button>
      <p className="sr-only" aria-live="polite">{result && !spinning ? result : ""}</p>
      <div className="tool-stage__action">
        <Button variant="primary" size="large" fullWidth onClick={decide} disabled={spinning}>
          {spinning ? "Deciding…" : result ? "Again" : "Decide"}
        </Button>
        {(tally.yes > 0 || tally.no > 0) && <p className="tool-stage__tally">Yes {tally.yes}, no {tally.no}</p>}
      </div>
    </>
  );

  const settings = (
    <Switch label="Allow “Maybe”" checked={allowMaybe} onChange={(e) => setAllowMaybe(e.target.checked)} />
  );

  return <ToolLayout className="yesno-tool" stage={stage} settings={settings} settingsLabel="Yes or no settings" />;
}
