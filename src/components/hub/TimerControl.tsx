"use client";

/**
 * TimerControl — Hub "Start timer" widget (Pro). Pick a preset or a custom
 * number of minutes (no cap, so streamers can go past 15), hit start, and a
 * countdown lands on the overlay. "Clear" removes it. Session-independent
 * (overlay is owner-keyed). Self-hides for non-Pro (actions return
 * `pro_required`).
 */

import { useState, useTransition } from "react";
import { Button, Input, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
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

  return (
    <Lever
      label="Timer"
      option={
        <span className="hub-lever__pair">
          <Select
            size="small"
            aria-label="Timer length"
            value={custom ? "custom" : String(minutes)}
            onChange={(v) => {
              if (v === "custom") setCustom(true);
              else {
                setCustom(false);
                setMinutes(Number(v));
              }
            }}
            options={[...PRESETS.map((m) => ({ value: String(m), label: `${m} min` })), { value: "custom", label: "Custom" }]}
          />
          {custom && (
            <Input
              size="small"
              type="number"
              min={1}
              max={999}
              value={String(customMin)}
              onChange={(e) => setCustomMin(Number(e.target.value) || 1)}
              aria-label="Minutes"
              className="hub-lever__minutes"
            />
          )}
        </span>
      }
      actions={
        <>
          <Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={start}>Start the timer</Button>
          <Button variant="ghost" size="small" onClick={stop} disabled={pending}>Clear</Button>
        </>
      }
    />
  );
}
