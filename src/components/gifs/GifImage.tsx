"use client";

/**
 * A GIF that plays for five seconds, then rests on its still frame with a play button (WCAG 2.2.2). Reduced motion
 * shows the still frame from the start. Replaying loads the animation again from its first frame.
 */

import { useEffect, useState } from "react";
import { IconButton } from "@empac/cascadeds";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { GIF_PLAY_MS, type GifView } from "@/lib/gifs/rules";

export function GifImage({ gif, maxWidth = 240, className }: { gif: GifView; maxWidth?: number; className?: string }) {
  const reduced = useReducedMotion();
  // 0 = resting on the still frame; 1 = the first play on its own; 2 and up = played again on request (also with
  // reduced motion, since the viewer asked for it).
  const [run, setRun] = useState(1);
  const playing = run > 1 || (run === 1 && !reduced);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setRun(0), GIF_PLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, run]);

  const alt = gif.alt || "A GIF";
  const src = playing ? (run === 1 ? gif.url : `${gif.url}?r=${run}`) : gif.still;
  return (
    <span className={`gs-gif${className ? ` ${className}` : ""}`} style={{ maxWidth, aspectRatio: `${gif.width} / ${gif.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gs-gif__img" src={src} alt={alt} width={gif.width} height={gif.height} loading="lazy" decoding="async" />
      {playing ? null : (
        <IconButton
          className="gs-gif__play"
          variant="secondary"
          size="medium"
          aria-label="Play the GIF"
          onClick={() => setRun((n) => Math.max(2, n + 1))}
        >
          <IconPlayerPlayFilled size={18} aria-hidden />
        </IconButton>
      )}
      <span className="gs-gif__tag" aria-hidden>GIF</span>
    </span>
  );
}
