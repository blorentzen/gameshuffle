"use client";

/**
 * Coin overlay renderer (Streamer Tools Integration). A 3D coin flips and lands
 * on the result. Self-contained CSS (overlay route loads only overlay.css).
 * Format-agnostic — the caller passes `style` from `placementStyle()`.
 */

import { useEffect, useRef, type CSSProperties } from "react";

export interface CoinOverlayPayload {
  result: "heads" | "tails";
  headsColor?: string | null;
  tailsColor?: string | null;
  triggeredBy?: string | null;
}

export function CoinOverlay({
  payload,
  style,
}: {
  payload: CoinOverlayPayload;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 4 full flips, then land: heads → 0°, tails → 180° (mod 360).
    const target = (payload.result === "tails" ? 180 : 0) + 360 * 4;
    const from = "rotateX(-12deg) rotateY(0deg)";
    const to = `rotateX(-12deg) rotateY(${target}deg)`;
    el.style.transform = to;
    const anim = el.animate([{ transform: from }, { transform: to }], {
      duration: 1400,
      easing: "cubic-bezier(0.2, 0.75, 0.3, 1)",
    });
    return () => anim.cancel();
  }, [payload.result]);

  const rootStyle = { ...style } as Record<string, string | number>;
  if (payload.headsColor) rootStyle["--coin-heads"] = payload.headsColor;
  if (payload.tailsColor) rootStyle["--coin-tails"] = payload.tailsColor;

  return (
    <div className="gs-overlay-coin" style={rootStyle as CSSProperties}>
      <div className="gs-overlay-coin__stage">
        <div ref={ref} className="gs-overlay-coin__coin">
          <div className="gs-overlay-coin__face gs-overlay-coin__face--heads">H</div>
          <div className="gs-overlay-coin__face gs-overlay-coin__face--tails">T</div>
        </div>
      </div>
      <div className="gs-overlay-coin__result">
        {payload.result === "heads" ? "Heads" : "Tails"}
      </div>
    </div>
  );
}
