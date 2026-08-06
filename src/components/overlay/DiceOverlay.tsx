"use client";

/**
 * Dice overlay renderer (Streamer Tools Integration, Phase 0). Renders a roll
 * result as 3D pip cubes that tumble in and settle on their values, in the
 * streamer's chosen colors. Reuses the global `.dice-cube` styles + DicePips.
 * Format-agnostic — the caller passes `style` from `placementStyle()`.
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { DicePips } from "@/components/companion/DicePips";

// Cube geometry (kept local to avoid refactoring the working free-tool).
const CUBE_FACES: { value: number; transform: string }[] = [
  { value: 1, transform: "rotateY(0deg) translateZ(var(--die-half))" },
  { value: 6, transform: "rotateY(180deg) translateZ(var(--die-half))" },
  { value: 3, transform: "rotateY(90deg) translateZ(var(--die-half))" },
  { value: 4, transform: "rotateY(-90deg) translateZ(var(--die-half))" },
  { value: 2, transform: "rotateX(90deg) translateZ(var(--die-half))" },
  { value: 5, transform: "rotateX(-90deg) translateZ(var(--die-half))" },
];
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0],
};

function OverlayDie({ value, index }: { value: number; index: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const [bx, by] = FACE_ROT[value] ?? [0, 0];
    el.style.animation = "none";
    const from = "perspective(700px) rotateX(-20deg) rotateY(0deg)";
    const target = `perspective(700px) rotateX(${bx + 720}deg) rotateY(${by + 360 * (index + 2)}deg)`;
    el.style.transform = target;
    const anim = el.animate([{ transform: from }, { transform: target }], {
      duration: 1150,
      easing: "cubic-bezier(0.2, 0.72, 0.3, 1)",
    });
    return () => anim.cancel();
  }, [value, index]);

  return (
    <span ref={ref} className="dice-cube">
      {CUBE_FACES.map((f) => (
        <span key={f.value} className="dice-cube__face" style={{ transform: f.transform }}>
          <DicePips value={f.value} />
        </span>
      ))}
    </span>
  );
}

export interface DiceOverlayPayload {
  values: number[];
  dieColor?: string;
  pipColor?: string;
  triggeredBy?: string | null;
}

export function DiceOverlay({
  payload,
  style,
}: {
  payload: DiceOverlayPayload;
  style?: CSSProperties;
}) {
  const { values, dieColor = "#eef1f6", pipColor = "#1b2740" } = payload;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div
      className="gs-overlay-dice"
      style={{ ...style, "--die-face": dieColor, "--pip-color": pipColor } as CSSProperties}
    >
      <div className="gs-overlay-dice__row">
        {values.map((v, i) => (
          <OverlayDie key={i} value={v} index={i} />
        ))}
      </div>
      {values.length > 1 && <div className="gs-overlay-dice__total">= {total}</div>}
    </div>
  );
}
