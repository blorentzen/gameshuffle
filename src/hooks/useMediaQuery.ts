"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe: the initializer reads `matchMedia`
 * synchronously on the client (consumers here render only after auth resolves,
 * so the correct value is available on first paint — no flash) and falls back
 * to `false` on the server.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Desktop = the width where the navbar shows its full (non-hamburger) layout.
 *  Below this, comms surfaces deep-link to /comms rather than open a popover. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
