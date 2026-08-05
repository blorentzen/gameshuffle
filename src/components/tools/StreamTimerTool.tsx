"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@empac/cascadeds";

const PRESETS = [5, 10, 15, 20, 30];

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function StreamTimerTool() {
  const [minutes, setMinutes] = useState(15);
  const [label, setLabel] = useState("Starting soon");
  const [remaining, setRemaining] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (endRef.current == null) return;
      const rem = Math.max(0, (endRef.current - Date.now()) / 1000);
      setRemaining(rem);
      if (rem <= 0) setRunning(false);
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  function start() {
    if (typeof window !== "undefined") window.plausible?.("Tool Used", { props: { tool: "stream-timer" } });
    endRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  }
  function applyMinutes(m: number) {
    setMinutes(m);
    if (!running) setRemaining(m * 60);
  }

  function overlayUrl(): string {
    const p = new URLSearchParams({ mins: String(minutes) });
    if (label.trim()) p.set("label", label.trim());
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/stream-timer/overlay?${p.toString()}`;
  }
  async function copyOverlay() {
    try {
      await navigator.clipboard.writeText(overlayUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — no-op
    }
  }

  return (
    <div className="tool-panel">
      <div className="timer-tool__display">
        <span className="timer-tool__time">{fmtTime(remaining)}</span>
        {label && <span className="timer-tool__label">{label}</span>}
      </div>

      <div className="timer-tool__controls">
        {running ? (
          <Button variant="secondary" onClick={() => setRunning(false)}>Pause</Button>
        ) : (
          <Button variant="primary" onClick={start}>Start</Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setRunning(false);
            setRemaining(minutes * 60);
          }}
        >
          Reset
        </Button>
      </div>

      <div className="timer-tool__settings">
        <span className="timer-tool__mins" role="group" aria-label="Minutes">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              className={`dice-tool__count-btn${minutes === m ? " is-active" : ""}`}
              onClick={() => applyMinutes(m)}
              aria-pressed={minutes === m}
            >
              {m}
            </button>
          ))}
        </span>
        <Input floatingLabel="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>

      <div className="timer-tool__overlay">
        <Button variant="secondary" onClick={() => void copyOverlay()}>
          {copied ? "Copied!" : "Copy OBS overlay link"}
        </Button>
        <p className="tool-page__lead">
          Add it as a Browser Source in OBS — it counts down from {minutes} min on load; refresh the
          source to restart.
        </p>
      </div>
    </div>
  );
}
