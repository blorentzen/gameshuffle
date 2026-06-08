"use client";

/**
 * Real 3D-flipping coin — front face (side A) and back face (side B)
 * are always rendered; CSS rotateY controls which face the viewer
 * sees at any moment. The result is hidden during the spin because
 * the rotation amount is large (~3 full revolutions) and both faces
 * are visible alternately — the viewer can't predict which side will
 * land facing them until the easing settles.
 *
 * The final rotation is computed from the pre-decided result:
 *   - Result A → end at 1080° (3 full spins, A side up)
 *   - Result B → end at 1260° (3 full spins + 180°, B side up)
 *
 * Phase drives whether the keyframe animation is applied or the
 * static end-state transform shows the settled coin. Switching from
 * "flipping" to "settled" while the animation is still in flight
 * would snap the coin — we let the animation own the visual right
 * up to the reveal moment via animation-fill-mode: forwards.
 */

import type { CSSProperties } from "react";
import { CoinFace } from "./CoinFace";
import type { CoinFlipEntry } from "@/lib/companion/types";

interface Props {
  resultSide: CoinFlipEntry["side"];
  /** "flipping" runs the spin animation; "settled" relies on the
   *  animation's forwards fill so the coin stays at the final
   *  rotation without snapping. */
  phase: "flipping" | "settled";
}

export function Coin3D({ resultSide, phase }: Props) {
  // 3 full revolutions (= 1080°) lands the front face (side A) up.
  // Add a half-turn (180°) for side B so the back face ends facing
  // the viewer.
  const finalRotation = resultSide === "a" ? 1080 : 1260;

  const style = {
    "--coin-final-rotation": `${finalRotation}deg`,
  } as CSSProperties;

  return (
    <div
      className={`companion-coin-3d companion-coin-3d--${phase}`}
      style={style}
    >
      <div className="companion-coin-3d__face companion-coin-3d__face--front">
        <CoinFace side="a" />
      </div>
      <div className="companion-coin-3d__face companion-coin-3d__face--back">
        <CoinFace side="b" />
      </div>
    </div>
  );
}
