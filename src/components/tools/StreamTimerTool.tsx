"use client";

/**
 * The free stream timer (/stream-timer). Its length and accent are the
 * account's saved timer look, the same one the GS Pro overlay timer and the
 * control room start from.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Input } from "@empac/cascadeds";
import { ToolLayout, ToolSetting } from "@/components/tools/ToolLayout";
import { ChoiceChips } from "@/components/tools/looks/LookControls";
import { useToolLook } from "@/components/tools/looks/useToolLook";

const PRESETS = [5, 10, 15, 20, 30];

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function StreamTimerTool() {
  const { look, setLook, ready, pro, brand } = useToolLook("timer", { toast: "Timer length saved" });
  const minutes = Math.max(1, Math.round(look.defaultSeconds / 60));
  const [label, setLabel] = useState("Starting soon");
  const [remaining, setRemaining] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<number | null>(null);

  // The saved length arrives after the first paint: show it until the timer is used.
  useEffect(() => {
    if (!ready || touched) return;
    const t = window.setTimeout(() => setRemaining(minutes * 60), 0);
    return () => window.clearTimeout(t);
  }, [ready, touched, minutes]);

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
    window.plausible?.("Tool Used", { props: { tool: "stream-timer" } });
    setTouched(true);
    endRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  }
  function applyMinutes(m: number) {
    setLook({ ...look, defaultSeconds: m * 60 });
    if (!running) setRemaining(m * 60);
  }

  function overlayUrl(): string {
    const p = new URLSearchParams({ mins: String(minutes) });
    if (label.trim()) p.set("label", label.trim());
    return `${window.location.origin}/stream-timer/overlay?${p.toString()}`;
  }
  async function copyOverlay() {
    try {
      await navigator.clipboard.writeText(overlayUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing to undo.
    }
  }

  const accent = look.accentColor === "brand" ? (pro && brand ? brand.primary : "var(--brand-primary)") : look.accentColor;
  const presets = PRESETS.includes(minutes) ? PRESETS : [...PRESETS, minutes].sort((a, b) => a - b);

  const stage = (
    <>
      <div className="timer-tool__display" style={{ "--timer-accent": accent } as CSSProperties}>
        <span className="timer-tool__time">{fmtTime(remaining)}</span>
        {label && <span className="timer-tool__label">{label}</span>}
      </div>
      <div className="tool-stage__action timer-tool__controls">
        {running ? (
          <Button variant="secondary" size="large" onClick={() => setRunning(false)}>Pause</Button>
        ) : (
          <Button variant="primary" size="large" onClick={start}>Start</Button>
        )}
        <Button variant="secondary" size="large" onClick={() => { setRunning(false); setRemaining(minutes * 60); }}>Reset</Button>
      </div>
    </>
  );

  const settings = (
    <>
      <ToolSetting label="Minutes">
        <ChoiceChips choices={presets.map((m) => ({ value: m, label: String(m) }))} value={minutes} onChange={applyMinutes} />
      </ToolSetting>
      <Input floatingLabel="Label" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
      <ToolSetting label="On your stream" note={`Add it as a Browser Source in OBS. It counts down from ${minutes} minutes when it loads; refresh the source to restart.`}>
        <Button variant="secondary" onClick={() => void copyOverlay()}>{copied ? "Copied" : "Copy the OBS link"}</Button>
      </ToolSetting>
    </>
  );

  return <ToolLayout className="timer-tool" stage={stage} settings={settings} settingsLabel="Timer settings" />;
}
