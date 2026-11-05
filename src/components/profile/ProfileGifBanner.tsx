"use client";

/**
 * A profile's animated banner (GIFs pick 8A): the GIF plays once, about five seconds, then rests on its first frame.
 * Reduced motion and a lapsed plan show the still from the start. Decorative (the band is aria-hidden).
 */

import { useEffect, useState } from "react";

const PLAY_MS = 5000;

export function ProfileGifBanner({ url, still, x, y, animate }: { url: string; still: string; x: number; y: number; animate: boolean }) {
  const [moving, setMoving] = useState(animate);
  useEffect(() => {
    if (!animate) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setMoving(false), reduced ? 0 : PLAY_MS);
    return () => window.clearTimeout(t);
  }, [animate]);
  return (
    <div
      className="profile-banner"
      aria-hidden="true"
      style={{ backgroundImage: `url(${moving ? url : still})`, backgroundPosition: `${x}% ${y}%` }}
    />
  );
}
