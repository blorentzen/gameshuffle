"use client";

import { useEffect } from "react";
import { EVENTS, track } from "@/lib/analytics/events";

/** Sends "Support Completed" once when the thanks page shows a paid session. */
export function SupportThanksTracker({ kind, amount }: { kind: string; amount: number }) {
  useEffect(() => { track(EVENTS.supportCompleted, { kind, amount }); }, [kind, amount]);
  return null;
}
