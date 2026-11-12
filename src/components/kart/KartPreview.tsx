"use client";

/**
 * The rolled ride with its driver in it, on a slow turntable, for the roll
 * card (client). The 3D model is the same one the race draws; three.js comes
 * in with a dynamic import, so the roll card shows first and no other page
 * carries it. It turns only while it's on screen and the race isn't covering
 * it, and stays still under reduced motion.
 */

import { useEffect, useRef, useState } from "react";
import { driverFor, TONE_COLORS } from "@/lib/kart/roster";
import type { Roll } from "@/lib/kart/roll";
import type { RideId } from "@/lib/kart/content";
import type { CharacterLook } from "@/components/games3d/character/types";
import { driverCanvas, type OwnAvatar } from "./engine/avatars";
import type { Preview } from "./engine/preview";

export function KartPreview({
  roll,
  ride = null,
  own,
  label,
  paused = false,
  look = null,
  pose = null,
}: {
  roll: Roll;
  ride?: RideId | null;
  own: OwnAvatar;
  label: string;
  paused?: boolean;
  /** Development only: a 3D driver in this look instead of the picture. */
  look?: CharacterLook | null;
  /** Development only: the 3D driver on its own, standing or flying. */
  pose?: "stand" | "fly" | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<Preview | null>(null);
  const visibleRef = useRef(true);
  const pausedRef = useRef(paused);
  const [ready, setReady] = useState(false);

  // Set up the turntable once.
  useEffect(() => {
    let live = true;
    const canvas = ref.current;
    if (!canvas) return;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    const sync = () => previewRef.current?.setRunning(visibleRef.current && !pausedRef.current && !document.hidden);
    document.addEventListener("visibilitychange", sync);
    void import("./engine/preview").then(({ createPreview }) => {
      if (!live) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const p = createPreview(canvas, { reducedMotion: reduced });
      if (!p) return;
      previewRef.current = p;
      const fit = () => {
        const r = canvas.getBoundingClientRect();
        p.resize(r.width, r.height, window.devicePixelRatio || 1);
      };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(canvas);
      io = new IntersectionObserver((entries) => {
        visibleRef.current = entries.some((e) => e.isIntersecting);
        sync();
      });
      io.observe(canvas);
      setReady(true);
    });
    return () => {
      live = false;
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  // Show the rolled ride.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const driver = driverFor(roll.driver);
    const tone = TONE_COLORS[driver.tone] ?? TONE_COLORS.blue;
    const shown = () => previewRef.current?.setRunning(visibleRef.current && !pausedRef.current && !document.hidden);
    if (look) {
      // Development: the shared 3D character (loaded with the engine's chunk).
      void import("./engine/figures")
        .then(({ figureArt }) => figureArt(driver, own, look))
        .then((art) => {
          const p = previewRef.current;
          if (!live || !p) return;
          p.show({ body: ride ?? roll.body, wheels: roll.wheels, tone, driver: null, figure: art, pose });
          shown();
        })
        .catch(() => {});
    } else {
      void driverCanvas(driver, own, Math.min(2, window.devicePixelRatio || 1)).then((face) => {
        const p = previewRef.current;
        if (!live || !p) return;
        p.show({ body: ride ?? roll.body, wheels: roll.wheels, tone, driver: face });
        shown();
      });
    }
    return () => {
      live = false;
    };
  }, [ready, roll, ride, own, look, pose]);

  // Still while the race covers it.
  useEffect(() => {
    pausedRef.current = paused;
    previewRef.current?.setRunning(visibleRef.current && !paused && !document.hidden);
  }, [paused]);

  return <canvas ref={ref} className="kart-preview" role="img" aria-label={label} />;
}
