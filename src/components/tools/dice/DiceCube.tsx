"use client";

/**
 * The simple dice: CSS 3D cubes with pips, driven by the Web Animations API.
 * One drawing for the free page's Simple roll and the stream overlay (item 14),
 * in the look's colors; pips follow the die color the same way the physics
 * dice pick their light or dark pips.
 *
 * Idle → a slow CSS spin. "animated" → tumbles from its last pose to the face
 * that shows `value`. "instant" → snaps. Explicit rotate() keyframes keep the
 * multi-turn tumble (a matrix interpolation would collapse whole turns).
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { DicePips } from "@/components/companion/DicePips";

export type DiceReveal = "idle" | "animated" | "instant";

const THROW_MS = 1150;

// A d6's six faces on a cube (opposite faces sum to 7).
const CUBE_FACES: { value: number; transform: string }[] = [
  { value: 1, transform: "rotateY(0deg) translateZ(var(--die-half))" },
  { value: 6, transform: "rotateY(180deg) translateZ(var(--die-half))" },
  { value: 3, transform: "rotateY(90deg) translateZ(var(--die-half))" },
  { value: 4, transform: "rotateY(-90deg) translateZ(var(--die-half))" },
  { value: 2, transform: "rotateX(90deg) translateZ(var(--die-half))" },
  { value: 5, transform: "rotateX(-90deg) translateZ(var(--die-half))" },
];

// Cube rotation (x, y degrees) that brings a value's face to the front.
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0],
};

// Perspective per die (not on the row) so every die is seen head-on wherever
// it sits; otherwise off-centre dice show a side face.
const PERSP = "perspective(640px)";
const IDLE_POSE = `${PERSP} rotateX(-20deg) rotateY(0deg)`;

export const DICE_THROW_MS = THROW_MS;

export function DiceCube({ value, index, reveal, spins = 0 }: { value: number | null; index: number; reveal: DiceReveal; spins?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const poseRef = useRef<string>(IDLE_POSE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null || reveal === "idle") {
      animRef.current?.cancel();
      animRef.current = null;
      el.style.animation = "";
      el.style.transform = "";
      poseRef.current = IDLE_POSE;
      return;
    }
    const [bx, by] = FACE_ROT[value] ?? [0, 0];
    el.style.animation = "none";
    if (reveal === "instant") {
      animRef.current?.cancel();
      animRef.current = null;
      const pose = `${PERSP} rotateX(${bx}deg) rotateY(${by}deg)`;
      el.style.transform = pose;
      poseRef.current = pose;
      return;
    }
    const from = poseRef.current;
    const target = `${PERSP} rotateX(${bx + 720}deg) rotateY(${by + 360 * (spins * 3 + index + 2)}deg)`;
    animRef.current?.cancel();
    el.style.transform = target;
    animRef.current = el.animate([{ transform: from }, { transform: target }], {
      duration: THROW_MS,
      easing: "cubic-bezier(0.2, 0.72, 0.3, 1)",
    });
    poseRef.current = target;
  }, [value, reveal, spins, index]);

  useEffect(() => () => animRef.current?.cancel(), []);

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

/** A row of cubes in the look's colors. `values` shorter than `count` leaves the rest idle. */
export function DiceRow({ count, values, reveal, spins = 0, dieColor, pipColor, className = "" }: {
  count: number;
  values: number[];
  reveal: DiceReveal;
  spins?: number;
  dieColor: string;
  pipColor: string;
  className?: string;
}) {
  return (
    <div className={`dice-row${className ? ` ${className}` : ""}`} style={{ "--die-face": dieColor, "--pip-color": pipColor } as CSSProperties}>
      {Array.from({ length: count }).map((_, i) => (
        <DiceCube key={i} index={i} value={values[i] ?? null} reveal={values.length === 0 ? "idle" : reveal} spins={spins} />
      ))}
    </div>
  );
}
