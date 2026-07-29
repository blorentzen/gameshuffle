"use client";

import { useEffect } from "react";
import { captureLeadSource } from "@/lib/analytics/leadSource";

/**
 * Fires lead-source capture on load. Mounted once in the root layout so it
 * catches whichever page a tagged link lands on (the TCG insert points at `/`,
 * but future campaigns may deep-link). Renders nothing.
 */
export function LeadSourceTracker() {
  useEffect(() => {
    captureLeadSource();
  }, []);
  return null;
}
