"use client";

import { useEffect } from "react";

/** Marks <html> as an OBS source so the page behind the card is transparent. */
export function ObsRoute() {
  useEffect(() => {
    document.documentElement.classList.add("mmr-obs-route");
    return () => document.documentElement.classList.remove("mmr-obs-route");
  }, []);
  return null;
}
