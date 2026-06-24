"use client";

/**
 * WheelOverlay — the spinning wheel rendered in the OBS overlay.
 *
 * The winner is already decided server-side (`winningIndex`); this just
 * choreographs an ease-out spin (CSS transition on `.gs-wheel__rotor`) that
 * lands that segment under the top pointer, then reveals the result. Honors
 * `prefers-reduced-motion` (snaps via the CSS media query).
 *
 * The wheel itself is the shared `WheelGraphic`; this owns the spin state.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { WheelGraphic } from "@/components/wheel/WheelGraphic";
import { computeSlices, landingRotation } from "@/lib/wheel/geometry";
import { getFillStyle, getTheme } from "@/lib/wheel/themes";

interface Seg {
  label: string;
  weight?: number;
  color?: string;
}

export interface WheelSpinView {
  id: string;
  segments: Seg[];
  winningIndex: number;
  winningLabel: string;
  triggeredBy: string | null;
  /** Theme id + fill style (Pro carry-over); fall back to defaults. */
  themeId?: string | null;
  fillStyle?: string | null;
}

const SPIN_MS = 5000;

export function WheelOverlay({
  spin,
  onSpinComplete,
}: {
  spin: WheelSpinView;
  /** Fired once the wheel finishes landing in-stream (drives the chat announce). */
  onSpinComplete?: (spinId: string) => void;
}) {
  const finalRotation = useMemo(
    () => landingRotation(computeSlices(spin.segments), spin.winningIndex),
    [spin.segments, spin.winningIndex],
  );

  // Keep the latest callback without re-triggering the animation effect.
  const onCompleteRef = useRef(onSpinComplete);
  useEffect(() => {
    onCompleteRef.current = onSpinComplete;
  }, [onSpinComplete]);

  // Start at 0 (matches SSR) and animate to the final rotation after mount
  // so the CSS transition runs. For reduced motion the rotor's transition
  // is disabled in CSS (it snaps) and we reveal the result sooner.
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t1 = window.setTimeout(() => setRotation(finalRotation), 60);
    const t2 = window.setTimeout(() => {
      setShowResult(true);
      onCompleteRef.current?.(spin.id);
    }, reduce ? 300 : SPIN_MS + 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // Re-run per spin (id) — finalRotation is derived from the same spin.
  }, [spin.id, finalRotation]);

  return (
    <div className={`gs-wheel${showResult ? " gs-wheel--result" : ""}`}>
      <div className="gs-wheel__stage">
        <WheelGraphic
          segments={spin.segments}
          rotation={rotation}
          theme={getTheme(spin.themeId)}
          fillStyle={getFillStyle(spin.fillStyle)}
          rotorClassName="gs-wheel__rotor"
          svgClassName="gs-wheel__svg"
        />
      </div>
      <div className="gs-wheel__result" role="status">
        {spin.winningLabel}
      </div>
    </div>
  );
}
