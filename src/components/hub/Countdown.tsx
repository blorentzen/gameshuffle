"use client";

/**
 * Live countdown timer — ticks every second, renders relative time.
 *
 * Used for "Window opens in 47m" / "Grace expires in 12m" / "Wrap-up in 38s"
 * indicators on the session detail page. Userland helper approved per
 * Phase 4A CDS inventory C.1.
 *
 * Server-renders an initial string (so first paint matches client paint),
 * then the client-side useEffect picks up the ticking. If the target is
 * null or already past, renders the placeholder + stops ticking.
 */

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/time/relative";

interface CountdownProps {
  /** ISO timestamp string for the target moment. */
  to: string | null | undefined;
  /** Verbose form ("5 minutes from now") vs compact ("5m"). Default compact. */
  verbose?: boolean;
  /**
   * Render a custom string when the target is reached or null. Defaults
   * to "—" for null and `formatRelativeTime` output (which gracefully
   * handles past timestamps as "Xm ago") for past targets.
   */
  fallback?: string;
}

export function Countdown({ to, verbose = false, fallback }: CountdownProps) {
  const [text, setText] = useState(() =>
    to ? formatRelativeTime(to, { verbose }) : (fallback ?? "—")
  );

  useEffect(() => {
    if (!to) {
      setText(fallback ?? "—");
      return;
    }
    // Tick every second so countdowns update smoothly. If the page is
    // hidden, the browser's setInterval will throttle — that's fine; the
    // string stays stale until the next tick when the tab becomes
    // visible again.
    const tick = () => setText(formatRelativeTime(to, { verbose }));
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [to, verbose, fallback]);

  return <span className="hub-countdown">{text}</span>;
}
