"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe: the server and the first (hydrating) render both say `false`, then the
 * browser's answer follows; a component that mounts later reads the real value on its first paint. (Reading
 * `matchMedia` in a state initializer made server-rendered users, like a profile's Top Friends, mismatch on desktop.)
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Desktop = the width where the navbar shows its full (non-hamburger) layout.
 *  Below this, comms surfaces deep-link to /comms rather than open a popover. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
