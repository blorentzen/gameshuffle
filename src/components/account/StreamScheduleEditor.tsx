"use client";

/**
 * Stream schedule editor — recurring weekly slots + a timezone, autosaved to
 * /api/account/schedule (validated server-side). Surfaces on the streamer's /u,
 * /c, and /live as a friendlier alternative to Twitch's schedule.
 */

import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Icon, Input, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { WEEKDAYS, resolveStreamSchedule, type ScheduleSlot } from "@/lib/schedule/streamSchedule";

// A short curated tz list + the viewer's detected zone.
const COMMON_TZ = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Athens",
  "Africa/Johannesburg", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland", "UTC",
];

export function StreamScheduleEditor() {
  const toast = useToast();
  const detected = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [timezone, setTimezone] = useState(detected);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const armed = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/schedule")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const sched = resolveStreamSchedule(j?.schedule);
        if (sched) { setTimezone(sched.timezone); setSlots(sched.slots); }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!armed.current) { armed.current = true; return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/account/schedule", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule: slots.length ? { timezone, slots } : null }),
        });
        if (res.ok) setSaveState("saved");
        else { setSaveState("error"); if ((await res.json().catch(() => null))?.error === "migration_pending") toast.error("Schedule saving isn't enabled yet."); }
      } catch { setSaveState("error"); }
    }, 700);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, slots]);

  const addSlot = () => setSlots((s) => [...s, { day: 1, start: "19:00", durationMins: 120, title: null }]);
  const setSlot = (i: number, patch: Partial<ScheduleSlot>) => setSlots((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeSlot = (i: number) => setSlots((s) => s.filter((_, idx) => idx !== i));

  const tzOptions = Array.from(new Set([detected, ...COMMON_TZ])).map((t) => ({ value: t, label: t.replace(/_/g, " ") }));

  if (loading) return <div className="account-card"><p style={{ color: "var(--text-secondary)" }}>Loading schedule…</p></div>;

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 className="account-tab__heading" style={{ margin: 0 }}>Stream schedule</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>
      <p className="account-tab__intro">Set your recurring stream times. They show a &ldquo;next stream&rdquo; countdown and weekly grid on your profile, community page, and live page.</p>

      <div style={{ maxWidth: "22rem", marginBottom: "var(--spacing-16)" }}>
        <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-6)" }}>Your timezone</label>
        <Select value={timezone} onChange={(v) => setTimezone(typeof v === "string" ? v : v[0] ?? "UTC")} options={tzOptions} fullWidth />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
        {slots.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "0 0 7rem" }}>
              <Select value={String(s.day)} onChange={(v) => setSlot(i, { day: Number(typeof v === "string" ? v : v[0]) })}
                options={WEEKDAYS.map((d, idx) => ({ value: String(idx), label: d }))} fullWidth />
            </span>
            <input type="time" value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} className="save-setup-input" style={{ width: "8rem" }} />
            <span style={{ flex: "1 1 10rem", minWidth: 0 }}>
              <Input value={s.title ?? ""} onChange={(e) => setSlot(i, { title: e.target.value.slice(0, 60) || null })} placeholder="What you're playing (optional)" fullWidth />
            </span>
            <IconButton variant="tertiary" size="small" aria-label="Remove slot" onClick={() => removeSlot(i)}><Icon name="x" size="18" /></IconButton>
          </div>
        ))}
        <Button variant="secondary" size="small" onClick={addSlot} style={{ alignSelf: "flex-start" }}>+ Add stream time</Button>
      </div>
    </div>
  );
}
