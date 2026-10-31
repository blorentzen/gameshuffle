"use client";

/**
 * Coin overlay renderer: the same Coin as the free page, in the streamer's
 * coin look (finish, letters, picture, brand colors), flipping on arrival and
 * landing on the result. Format-agnostic: the caller passes `style`.
 */

import type { CSSProperties } from "react";
import { Coin } from "@/components/tools/coin/Coin";
import { coinPaint, normalizeCoinLook, type CoinPaint } from "@/lib/tools/looks";

export interface CoinOverlayPayload {
  result: "heads" | "tails";
  /** The coin as drawn (sent since tool looks; older events only had colors). */
  paint?: CoinPaint | null;
  headsColor?: string | null;
  tailsColor?: string | null;
  triggeredBy?: string | null;
}

const FLIP_MS = 1400;

export function CoinOverlay({ payload, style }: { payload: CoinOverlayPayload; style?: CSSProperties }) {
  const paint = payload.paint ?? coinPaint(normalizeCoinLook({ headsColor: payload.headsColor ?? undefined }), { pro: false });
  // Four full turns, then land: heads at 0°, tails at 180°.
  const rotation = (payload.result === "tails" ? 180 : 0) + 360 * 4;
  return (
    <div className="gs-overlay-coin" style={style}>
      <div className="gs-overlay-coin__stage">
        <Coin paint={paint} rotation={rotation} from={0} durationMs={FLIP_MS} />
      </div>
      <div className="gs-overlay-coin__result">{payload.result === "heads" ? "Heads" : "Tails"}</div>
    </div>
  );
}
