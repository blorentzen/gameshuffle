"use client";

/**
 * The free Magic 8-Ball (/magic-8-ball): the shared ball the stream overlay
 * draws too. A GS Pro account's own answers (Tool looks ▸ Oracle) join the
 * classic twenty here as well.
 */

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { ToolLayout, ToolSetting } from "@/components/tools/ToolLayout";
import { EightBall, type EightBallAnswerView } from "@/components/tools/eightball/EightBall";
import { useLookContext } from "@/components/tools/looks/useToolLook";
import { eightBallPool } from "@/lib/tools/looks";

export function MagicEightBallTool() {
  const { pro, eightBall } = useLookContext();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<EightBallAnswerView | null>(null);
  const [shaking, setShaking] = useState(false);
  const ownAnswers = pro && !!eightBall && (eightBall.custom.length > 0 || eightBall.disabled.length > 0);

  function shake() {
    if (shaking) return;
    window.plausible?.("Tool Used", { props: { tool: "8-ball" } });
    setShaking(true);
    setAnswer(null);
    const pool = eightBallPool(ownAnswers ? eightBall : null);
    window.setTimeout(() => {
      setAnswer(pool[Math.floor(Math.random() * pool.length)]);
      setShaking(false);
    }, 900);
  }

  const stage = (
    <>
      <EightBall answer={answer} shaking={shaking} onClick={shake} />
      <p className="sr-only" aria-live="polite">{answer && !shaking ? answer.text : ""}</p>
      <div className="tool-stage__action">
        <Button variant="primary" size="large" fullWidth onClick={shake} disabled={shaking}>
          {shaking ? "Shaking…" : answer ? "Ask again" : "Shake"}
        </Button>
      </div>
    </>
  );

  const settings = (
    <ToolSetting label="Your question" note={ownAnswers ? "Your own answers from Tool looks are in the mix." : "Optional. Think it or type it, then shake."}>
      <Input
        aria-label="Your question"
        placeholder="Will we win tonight?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") shake(); }}
        fullWidth
      />
    </ToolSetting>
  );

  return <ToolLayout className="eight-tool" stage={stage} settings={settings} settingsLabel="8-ball settings" />;
}
