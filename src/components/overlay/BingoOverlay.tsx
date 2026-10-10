"use client";

/**
 * Community Bingo overlay renderer (Streamer Tools Integration, Phase 3). Draws
 * the shared size×size board; marked squares fill with the streamer's accent,
 * the free center shows a star. A `justWon` payload pops a "BINGO!" banner (the
 * event id changes each mark, so OverlayClient remounts this and the banner
 * animation plays once on the completing mark). A `cleared` payload renders
 * nothing.
 */

import { type CSSProperties } from "react";
import { resolveOverlayAccent } from "@/lib/overlay/accent";
import { accessibleFill } from "@/lib/theme/contrast";
import { isImageUrl } from "@/lib/overlay/imageItem";

export interface BingoOverlayPayload {
  size?: number;
  squares?: string[];
  marked?: number[];
  freeCenter?: boolean;
  lines?: number;
  accentColor?: string;
  justWon?: boolean;
  cleared?: boolean;
}

export function BingoOverlay({
  payload,
  style,
}: {
  payload: BingoOverlayPayload;
  style?: CSSProperties;
}) {
  const size = payload.size ?? 5;
  const squares = payload.squares ?? [];
  if (payload.cleared || squares.length === 0) return null;

  const marked = new Set(payload.marked ?? []);
  const accent = resolveOverlayAccent(payload.accentColor);
  const center = payload.freeCenter && size % 2 === 1 ? Math.floor((size * size) / 2) : -1;

  // Marked squares put text on the accent, so they get a fill whose text
  // clears 4.5:1: the brand's own (brand.ts works it out) or, for a custom
  // color, the nearest shade that does. The raw accent stays for the trim.
  const mark = accent.startsWith("#")
    ? accessibleFill(accent)
    : payload.accentColor === "brand-accent"
      ? { fill: accent, on: "#ffffff" }
      : { fill: "var(--brand-fill-dark, var(--brand-primary))", on: "var(--brand-on-dark, #ffffff)" };

  const rootStyle: CSSProperties = {
    ...style,
    ["--bingo-accent" as string]: accent,
    ["--bingo-mark" as string]: mark.fill,
    ["--bingo-mark-on" as string]: mark.on,
    ["--bingo-size" as string]: String(size),
  };

  return (
    <div className="gs-overlay-bingo-pos" style={rootStyle}>
      <div className={`gs-overlay-bingo${payload.justWon ? " is-won" : ""}`}>
        {payload.justWon ? <div className="gs-overlay-bingo__banner">BINGO!</div> : null}
        <div className="gs-overlay-bingo__grid">
          {squares.map((text, i) => {
            const isCenter = i === center;
            const isMarked = isCenter || marked.has(i);
            return (
              <div
                key={i}
                className={`gs-overlay-bingo__cell${isMarked ? " is-marked" : ""}`}
              >
                {!isCenter && isImageUrl(text) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={text} alt="" className="gs-overlay-bingo__cell-img" />
                ) : (
                  <span className="gs-overlay-bingo__cell-text">
                    {isCenter ? "★" : text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
