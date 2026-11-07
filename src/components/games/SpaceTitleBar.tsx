"use client";

/**
 * The slim title bar a space's header folds into once it scrolls away (phone picks 2026-11-05, 1A; like Twitch and
 * Instagram): the box art, the name and Join, under the site's nav. Phones only (CSS); the tabs stay under it.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export function SpaceTitleBar({ watch, children }: { watch: string; children: ReactNode }) {
  const [folded, setFolded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const head = document.getElementById(watch);
    if (!head) return;
    const io = new IntersectionObserver(([e]) => setFolded(!e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(head);
    return () => io.disconnect();
  }, [watch]);
  useEffect(() => {
    document.documentElement.style.setProperty("--space-bar-h", folded ? "52px" : "0px");
    return () => { document.documentElement.style.removeProperty("--space-bar-h"); };
  }, [folded]);
  return <div ref={ref} className={`space-bar${folded ? " space-bar--on" : ""}`} aria-hidden={!folded} inert={!folded}>{children}</div>;
}
