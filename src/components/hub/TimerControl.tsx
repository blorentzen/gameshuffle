"use client";

/**
 * TimerControl — Hub "Start timer" widget (Pro). Pick a preset or a custom
 * number of minutes (no cap, so streamers can go past 15), hit start, and a
 * countdown lands on the overlay. "Clear" removes it. Session-independent
 * (overlay is owner-keyed). Self-hides for non-Pro (actions return
 * `pro_required`).
 */

import { useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import { startTimerAction, stopTimerAction } from "@/app/hub/sessions/[slug]/actions";

const PRESETS = [1, 3, 5, 10, 15]; // minutes

export function TimerControl() {
  const [minutes, setMinutes] = useState(5);
  const [custom, setCustom] = useState(false);
  const [customMin, setCustomMin] = useState(20);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const chosen = Math.max(1, Math.round(custom ? customMin : minutes));

  const start = () => {
    startTransition(async () => {
      const res = await startTimerAction(chosen * 60, null);
      if (!res.ok && res.error === "pro_required") setHidden(true);
    });
  };

  const stop = () => {
    startTransition(async () => {
      const res = await stopTimerAction();
      if (!res.ok && res.error === "pro_required") setHidden(true);
    });
  };

  const field: React.CSSProperties = {
    height: 36,
    borderRadius: "var(--radius-8, 0.5rem)",
    border: "1px solid var(--border-default)",
    padding: "0 var(--spacing-8)",
    background: "var(--surface-default)",
    color: "var(--text-primary)",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
      <select
        value={custom ? "custom" : String(minutes)}
        onChange={(e) => {
          if (e.target.value === "custom") setCustom(true);
          else {
            setCustom(false);
            setMinutes(Number(e.target.value));
          }
        }}
        aria-label="Timer duration"
        style={field}
      >
        {PRESETS.map((m) => (
          <option key={m} value={String(m)}>
            {m} min
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>

      {custom && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input
            type="number"
            min={1}
            max={999}
            value={customMin}
            onChange={(e) => setCustomMin(Number(e.target.value) || 1)}
            aria-label="Custom minutes"
            style={{ ...field, width: 72 }}
          />
          <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>min</span>
        </span>
      )}

      <Button variant="primary" loading={pending} onClick={start}>
        ⏱️ Start timer
      </Button>
      <Button variant="ghost" onClick={stop} disabled={pending}>
        Clear
      </Button>
    </div>
  );
}
