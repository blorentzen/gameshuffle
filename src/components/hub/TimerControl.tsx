"use client";

/**
 * TimerControl — Hub "Start timer" widget (Pro). Pick a preset or a custom
 * number of minutes (no cap, so streamers can go past 15), hit start, and a
 * countdown lands on the overlay. "Clear" removes it. Session-independent
 * (overlay is owner-keyed). The length starts at the streamer's saved timer
 * look (Tool looks or the free timer page). Self-hides for non-Pro (actions
 * return `pro_required`).
 */

import { useState, useTransition } from "react";
import { Button, Input, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
import { startTimerAction, stopTimerAction } from "@/app/hub/sessions/[slug]/actions";
import { useToolLook } from "@/components/tools/looks/useToolLook";

const PRESETS = [1, 3, 5, 10, 15]; // minutes

export function TimerControl() {
  const { look } = useToolLook("timer", { forStream: true });
  const saved = Math.max(1, Math.round(look.defaultSeconds / 60));
  // Until a length is picked here, the saved one stands (a preset, or "Custom" with its minutes).
  const [picked, setPicked] = useState<{ minutes: number; custom: boolean; customMin: number } | null>(null);
  const minutes = picked?.minutes ?? (PRESETS.includes(saved) ? saved : 5);
  const custom = picked?.custom ?? !PRESETS.includes(saved);
  const customMin = picked?.customMin ?? (PRESETS.includes(saved) ? 20 : saved);
  const setMinutes = (m: number) => setPicked({ minutes: m, custom: false, customMin });
  const setCustom = (on: boolean) => setPicked({ minutes, custom: on, customMin });
  const setCustomMin = (m: number) => setPicked({ minutes, custom: true, customMin: m });
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
              else setMinutes(Number(v));
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
