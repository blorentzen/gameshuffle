"use client";

import { useCallback } from "react";

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number> }
    ) => void;
  }
}

export function useAnalytics() {
  const trackEvent = useCallback(
    (event: string, props?: Record<string, string | number>) => {
      if (typeof window !== "undefined" && window.plausible) {
        window.plausible(event, props ? { props } : undefined);
      }
    },
    []
  );

  return { trackEvent };
}
