"use client";

/**
 * Precise countdown for prediction-market lock windows. Ticks every
 * second, renders `M:SS` (or `MM:SS`), and steps through three color
 * tiers so the urgency is immediately visible:
 *
 *   - default   (> 60s remaining) — neutral text color
 *   - warning   (≤ 60s)            — warning-700
 *   - danger    (≤ 10s)            — error-700, bold
 *
 * Shared between the viewer-side `LiveMarketsTab` and the streamer-
 * side `MarketsAdminPanel`. Renders nothing when `to` is null or in
 * the past so callers can sprinkle it without branching.
 */

import { useEffect, useState } from "react";

interface Props {
  /** ISO timestamp of the lock moment. Null when no timer is set
   *  (e.g. resolved or cancelled market). */
  to: string | null | undefined;
  /** Optional label prefix shown inline ("Locks in", "Closing"). */
  label?: string;
  /** Optional className passed through to the root span so callers
   *  can layer in their own spacing or surface. */
  className?: string;
}

interface Remaining {
  text: string;
  tier: "default" | "warning" | "danger";
}

function compute(to: string): Remaining | null {
  const ms = Date.parse(to);
  if (!Number.isFinite(ms)) return null;
  const diffMs = ms - Date.now();
  if (diffMs <= 0) return null;
  const totalSeconds = Math.ceil(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const text = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const tier: Remaining["tier"] =
    totalSeconds <= 10 ? "danger" : totalSeconds <= 60 ? "warning" : "default";
  return { text, tier };
}

export function MarketTimer({ to, label, className }: Props) {
  const [remaining, setRemaining] = useState<Remaining | null>(() =>
    to ? compute(to) : null,
  );

  useEffect(() => {
    if (!to) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(compute(to));
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [to]);

  if (!remaining) return null;

  const classes = [
    "market-timer",
    `market-timer--${remaining.tier}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role="timer" aria-live="polite">
      {label && <span className="market-timer__label">{label}</span>}
      <span className="market-timer__value">{remaining.text}</span>
    </span>
  );
}
