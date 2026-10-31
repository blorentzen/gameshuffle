"use client";

/**
 * The free coin flip (/coin-flip): the shared Coin in the account's saved
 * coin look (finish, letters; GS Pro picture face and brand colors).
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { ToolLayout } from "@/components/tools/ToolLayout";
import { Coin } from "@/components/tools/coin/Coin";
import { CoinLookFields } from "@/components/tools/coin/CoinLookFields";
import { useToolLook } from "@/components/tools/looks/useToolLook";
import { DEFAULT_COIN_LOOK, coinLetter, coinPaint } from "@/lib/tools/looks";

const FLIP_MS = 780;

export function CoinFlipTool() {
  const { look, setLook, pro, brand, avatarUrl } = useToolLook("coin", { toast: "Coin look saved" });
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [tally, setTally] = useState({ heads: 0, tails: 0 });

  const paint = coinPaint(
    { ...look, heads: coinLetter(look.heads, DEFAULT_COIN_LOOK.heads), tails: coinLetter(look.tails, DEFAULT_COIN_LOOK.tails) },
    { pro, brand, avatarUrl },
  );

  function flip() {
    if (flipping) return;
    window.plausible?.("Tool Used", { props: { tool: "coin" } });
    setFlipping(true);
    const r: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    // Land on 0deg (heads) or 180deg (tails) after several full turns.
    setRotation((prev) => prev - (prev % 360) + 5 * 360 + (r === "tails" ? 180 : 0));
    window.setTimeout(() => {
      setResult(r);
      setTally((t) => ({ ...t, [r]: t[r] + 1 }));
      setFlipping(false);
    }, FLIP_MS);
  }

  const stage = (
    <>
      <div className="coin-tool__stage" aria-hidden="true">
        <Coin paint={paint} rotation={rotation} durationMs={FLIP_MS} />
      </div>
      <div className="tool-stage__action">
        <Button variant="primary" size="large" fullWidth onClick={flip} disabled={flipping}>
          {flipping ? "Flipping…" : "Flip the coin"}
        </Button>
        <p className="tool-stage__result" aria-live="polite">
          {result && !flipping ? <>It&apos;s <strong>{result}</strong></> : " "}
        </p>
        {tally.heads + tally.tails > 0 && (
          <p className="tool-stage__tally">Heads {tally.heads}, tails {tally.tails}</p>
        )}
      </div>
    </>
  );

  return (
    <ToolLayout
      className="coin-tool"
      stage={stage}
      settings={<CoinLookFields look={look} onChange={setLook} pro={pro} hasPicture={!!avatarUrl} from="coin-page" />}
      settingsLabel="Coin settings"
    />
  );
}
