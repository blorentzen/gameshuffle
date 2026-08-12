"use client";

import { useEffect, useRef, useState } from "react";
import { getImagePath } from "@/lib/images";

interface Part {
  name: string;
  img: string;
}

interface KartSlotProps {
  label: string;
  name: string | null;
  imageSrc: string | null;
  /** The full pool for this slot type. When present (3+), a new pick plays a
   *  decelerating roulette reel through the pool before landing on the result. */
  pool?: Part[];
  /**
   * Whether to play the rolling reel. Explicit value wins (a streamer can force
   * it on/off). When undefined, falls back to the OS `prefers-reduced-motion`
   * setting so reduced-motion users get an instant swap by default.
   */
  animate?: boolean;
}

const FALLBACK = "/images/fg/itembox.png";

export function KartSlot({ label, name, imageSrc, pool, animate }: KartSlotProps) {
  const [display, setDisplay] = useState<{ img: string | null; name: string | null }>({
    img: imageSrc,
    name,
  });
  const [phase, setPhase] = useState<"idle" | "spinning" | "landed">("idle");
  // Bumped on every frame so the <img> remounts and replays its entry animation.
  const [frame, setFrame] = useState(0);
  const timers = useRef<number[]>([]);
  const prevSrc = useRef<string | null>(imageSrc);

  useEffect(() => {
    // Only react when the target part actually changes.
    if (imageSrc === prevSrc.current) return;
    prevSrc.current = imageSrc;

    // Cancel any in-flight spin (rapid re-rolls).
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // Explicit toggle wins; when unset, fall back to the OS reduced-motion pref.
    const osReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = animate === undefined ? !osReduced : animate;

    // Nothing to spin through (cleared, no pool, or animation off) → set directly,
    // with no reel and no landing pop.
    if (!imageSrc || !pool || pool.length < 3 || !shouldAnimate) {
      setDisplay({ img: imageSrc, name });
      setPhase("idle");
      setFrame((f) => f + 1);
      return;
    }

    // Decelerating reel: fast at the start, easing to a stop, then land.
    const STEPS = 16;
    setPhase("spinning");
    let elapsed = 0;
    for (let i = 0; i < STEPS; i++) {
      const frac = i / STEPS;
      const delay = 22 + Math.pow(frac, 2.3) * 135; // ease-out spacing
      elapsed += delay;
      const id = window.setTimeout(() => {
        const p = pool[Math.floor(Math.random() * pool.length)];
        setDisplay({ img: p.img, name: p.name });
        setFrame((f) => f + 1);
      }, elapsed);
      timers.current.push(id);
    }
    // Land on the real result with a pop.
    const landId = window.setTimeout(() => {
      setDisplay({ img: imageSrc, name });
      setPhase("landed");
      setFrame((f) => f + 1);
      const clearId = window.setTimeout(() => setPhase("idle"), 420);
      timers.current.push(clearId);
    }, elapsed + 70);
    timers.current.push(landId);
  }, [imageSrc, name, pool, animate]);

  useEffect(() => {
    const timersAtMount = timers;
    return () => {
      timersAtMount.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <li className={`kart-slot kart-slot--${phase}`}>
      <img
        key={frame}
        src={display.img ? getImagePath(display.img) : FALLBACK}
        alt={display.name || label}
      />
      <span>{display.name || (phase === "spinning" ? "…" : "???")}</span>
    </li>
  );
}
