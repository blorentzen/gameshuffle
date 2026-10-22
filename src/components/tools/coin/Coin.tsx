"use client";

/**
 * The coin (item 14): one drawing for the free page, the stream overlay and
 * the Layout preview, from a `CoinPaint` (finish, letters, picture) worked out
 * by `coinPaint()` so a look always means the same coin.
 *
 * `rotation` is the Y rotation in degrees (heads at 0, tails at 180, plus
 * whole turns). A change animates from the last rotation; `from` sets where a
 * freshly mounted coin starts (the overlay passes 0 so it flips on arrival).
 */

import { useEffect, useRef, type CSSProperties } from "react";
import type { CoinPaint } from "@/lib/tools/looks";

export function Coin({ paint, rotation, from, durationMs = 780, className = "" }: {
  paint: CoinPaint;
  rotation: number;
  from?: number;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<number>(from ?? rotation);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = prev.current;
    prev.current = rotation;
    if (start === rotation || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const anim = el.animate([{ transform: `rotateY(${start}deg)` }, { transform: `rotateY(${rotation}deg)` }], {
      duration: durationMs,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
    return () => {
      // A cancelled flip (a remount in development, or a new flip) starts again from here.
      if (anim.playState !== "finished") prev.current = start;
      anim.cancel();
    };
  }, [rotation, durationMs]);

  const vars = {
    "--coin-light": paint.light,
    "--coin-base": paint.base,
    "--coin-dark": paint.dark,
    "--coin-ink": paint.ink,
  } as CSSProperties;

  return (
    <div className={`gs-coin${className ? ` ${className}` : ""}`} style={vars}>
      <div ref={ref} className="gs-coin__coin" style={{ transform: `rotateY(${rotation}deg)` }}>
        <span className="gs-coin__face gs-coin__face--heads">
          {paint.heads.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a profile picture (often a data URI) sized by the coin
            <img className="gs-coin__img" src={paint.heads.image} alt="" />
          ) : (
            <span className={`gs-coin__text${Array.from(paint.heads.text).length > 1 ? " gs-coin__text--two" : ""}`}>{paint.heads.text}</span>
          )}
        </span>
        <span className="gs-coin__face gs-coin__face--tails">
          <span className={`gs-coin__text${Array.from(paint.tails.text).length > 1 ? " gs-coin__text--two" : ""}`}>{paint.tails.text}</span>
        </span>
      </div>
    </div>
  );
}
