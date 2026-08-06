"use client";

/**
 * Stream Timer overlay renderer (Streamer Tools Integration, Phase 3). A
 * persistent overlay event: counts down from an absolute `endsAt` so it stays
 * accurate regardless of when the overlay tab loaded or how it drifts. Goes red
 * in the final 10s, shows "TIME!" on zero, then self-hides after a short linger
 * (renders null — the persistent event stays in the set until replaced). A
 * `stopped` payload renders nothing.
 */

import { useEffect, useState, type CSSProperties } from "react";

export interface TimerOverlayPayload {
  endsAt?: string;
  seconds?: number;
  label?: string | null;
  accentColor?: string;
  stopped?: boolean;
}

/** How long "TIME!" lingers after the countdown hits zero before hiding. */
const LINGER_MS = 6000;

function formatClock(totalSeconds: number): string {
  const t = Math.max(0, totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function TimerOverlay({
  payload,
  style,
}: {
  payload: TimerOverlayPayload;
  style?: CSSProperties;
}) {
  const endsAtMs = payload.endsAt ? Date.parse(payload.endsAt) : NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (payload.stopped || !Number.isFinite(endsAtMs)) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [payload.stopped, endsAtMs]);

  if (payload.stopped || !Number.isFinite(endsAtMs)) return null;

  const remainingMs = endsAtMs - now;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const done = remainingMs <= 0;

  // Hide once the linger window after completion has elapsed.
  if (remainingMs < -LINGER_MS) return null;

  const urgent = !done && remainingSec <= 10;
  const accent = payload.accentColor ?? "#2f6fd6";

  const rootStyle: CSSProperties = {
    ...style,
    ["--timer-accent" as string]: accent,
  };

  return (
    <div className="gs-overlay-timer-pos" style={rootStyle}>
      <div
        className={`gs-overlay-timer${done ? " is-done" : urgent ? " is-urgent" : ""}`}
      >
        {payload.label ? (
          <div className="gs-overlay-timer__label">{payload.label}</div>
        ) : null}
        <div className="gs-overlay-timer__clock">
          {done ? "TIME!" : formatClock(remainingSec)}
        </div>
      </div>
    </div>
  );
}
