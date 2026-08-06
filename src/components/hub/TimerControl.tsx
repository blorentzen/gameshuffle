"use client";

/**
 * TimerControl — Hub "Start timer" widget (Pro). Pick a preset (or type minutes)
 * plus an optional label, and a countdown lands on the overlay. "Clear" removes
 * it. Session-independent (overlay is owner-keyed). Self-hides for non-Pro
 * (actions return `pro_required`). Mirrors DiceControl.
 */

import { useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import { startTimerAction, stopTimerAction } from "@/app/hub/sessions/[slug]/actions";

const PRESETS: { label: string; seconds: number }[] = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
];

export function TimerControl() {
  const [preset, setPreset] = useState(300);
  const [label, setLabel] = useState("");
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const start = () => {
    startTransition(async () => {
      const res = await startTimerAction(preset, label.trim() || null);
      if (!res.ok && res.error === "pro_required") setHidden(true);
    });
  };

  const stop = () => {
    startTransition(async () => {
      const res = await stopTimerAction();
      if (!res.ok && res.error === "pro_required") setHidden(true);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
      <select
        value={preset}
        onChange={(e) => setPreset(Number(e.target.value))}
        aria-label="Timer duration"
        style={{
          height: 36,
          borderRadius: "var(--radius-8, 0.5rem)",
          border: "1px solid var(--border-default)",
          padding: "0 var(--spacing-8)",
          background: "var(--surface-default)",
          color: "var(--text-primary)",
        }}
      >
        {PRESETS.map((p) => (
          <option key={p.seconds} value={p.seconds}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value.slice(0, 60))}
        placeholder="Label (optional)"
        aria-label="Timer label"
        style={{
          height: 36,
          width: 150,
          borderRadius: "var(--radius-8, 0.5rem)",
          border: "1px solid var(--border-default)",
          padding: "0 var(--spacing-8)",
          background: "var(--surface-default)",
          color: "var(--text-primary)",
        }}
      />
      <Button variant="primary" loading={pending} onClick={start}>
        ⏱️ Start timer
      </Button>
      <Button variant="ghost" onClick={stop} disabled={pending}>
        Clear
      </Button>
    </div>
  );
}
