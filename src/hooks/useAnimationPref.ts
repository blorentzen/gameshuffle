"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "gs-kart-animation";

/**
 * Whether the kart randomizer's rolling-reel animation should play.
 *
 * Source of truth is an explicit user/streamer choice persisted to
 * localStorage. Until a choice is made it defaults to the OS
 * `prefers-reduced-motion` setting (so reduced-motion users get no reel
 * out of the box), but an explicit toggle wins — a streamer can turn the
 * effect on for their overlay even if their machine prefers reduced motion.
 */
export function useAnimationPref(): [boolean, (value: boolean) => void] {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored != null) {
        setAnimate(stored === "1");
        return;
      }
    } catch {
      // localStorage unavailable — fall through to the OS default.
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setAnimate(!reduced);
  }, []);

  const set = (value: boolean) => {
    setAnimate(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // ignore persistence failures (private mode, etc.)
    }
  };

  return [animate, set];
}
