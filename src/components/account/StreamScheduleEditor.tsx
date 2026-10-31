"use client";

/**
 * Stream schedule editor (Streaming ▸ Setup ▸ Schedule): recurring weekly
 * slots, autosaved to /api/account/schedule (validated server-side). Shows on
 * the streamer's /u, /c and /live as a friendlier alternative to Twitch's.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, EmptyState, IconButton, Icon, Input, Select } from "@empac/cascadeds";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { useToast } from "@/components/toast/ToastProvider";
import { WEEKDAYS, resolveStreamSchedule, type ScheduleSlot } from "@/lib/schedule/streamSchedule";
import { LoadingLines } from "@/components/loading/LoadingLines";

const zoneName = (tz: string) => tz.replace(/_/g, " ");

/**
 * The schedule uses the timezone from Settings ▸ General (`profileTimezone`).
 * A schedule saved earlier in a different zone keeps it until the streamer
 * switches, so its times never shift without them knowing.
 */
export function StreamScheduleEditor({ profileTimezone = null, bare = false }: { profileTimezone?: string | null; bare?: boolean } = {}) {
  const toast = useToast();
  const detected = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [timezone, setTimezone] = useState(profileTimezone || detected);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);

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

  const { status } = useAutosave({ timezone, slots }, async (v) => {
    const res = await fetch("/api/account/schedule", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: v.slots.length ? v : null }),
    }).catch(() => null);
    if (!res?.ok) {
      if ((await res?.json().catch(() => null))?.error === "migration_pending") toast.error("Schedule saving isn't turned on here yet.");
      else toast.error("Couldn't save your schedule. Try again.");
      return false;
    }
    return true;
  }, { ready: !loading, toast: "Schedule saved" });

  const addSlot = () => setSlots((s) => [...s, { day: 1, start: "19:00", durationMins: 120, title: null }]);
  const setSlot = (i: number, patch: Partial<ScheduleSlot>) => setSlots((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeSlot = (i: number) => setSlots((s) => s.filter((_, idx) => idx !== i));

  if (loading) return <div className="account-card"><LoadingLines label="Loading schedule" /></div>;
  const mismatch = !!profileTimezone && slots.length > 0 && timezone !== profileTimezone;

  return (
    <div className={bare ? "schedule-editor" : "account-card"}>
      {!bare && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
            <h2 className="account-tab__heading" style={{ margin: 0 }}>Stream schedule</h2>
            <span style={{ fontSize: "var(--font-size-12)", color: status === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
            </span>
          </div>
          <p className="account-tab__intro">Your regular stream times. They show as a countdown and a weekly grid on your profile, community page and live page.</p>
        </>
      )}

      {mismatch ? (
        <Alert variant="info" title={`These times are in ${zoneName(timezone)}`}>
          Your timezone in Settings is {zoneName(profileTimezone!)}.{" "}
          <Button variant="secondary" size="small" onClick={() => setTimezone(profileTimezone!)}>Use {zoneName(profileTimezone!)}</Button>
        </Alert>
      ) : (
        <p className="admin-field__help">
          Times are in {zoneName(timezone)}{profileTimezone ? ", from " : ". Set your timezone in "}<Link href="/account?tab=settings">Settings ▸ General</Link>{profileTimezone ? "" : " to change it"}. Viewers see them in their own timezone.
        </p>
      )}

      {slots.length === 0 ? (
        <EmptyState variant="bordered" title="No stream times yet" description="Add your regular streams and viewers see when you're on next." action={<Button variant="secondary" size="small" onClick={addSlot}>Add a stream time</Button>} />
      ) : (
        <div className="schedule-rows">
          {slots.map((s, i) => (
            <div key={i} className="schedule-row">
              <Select aria-label={`Day for stream ${i + 1}`} value={String(s.day)} onChange={(v) => setSlot(i, { day: Number(typeof v === "string" ? v : v[0]) })}
                options={WEEKDAYS.map((d, idx) => ({ value: String(idx), label: d }))} fullWidth />
              <Input type="time" aria-label={`Start time for stream ${i + 1}`} value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} fullWidth />
              <Input aria-label={`Game for stream ${i + 1}`} value={s.title ?? ""} onChange={(e) => setSlot(i, { title: e.target.value.slice(0, 60) || null })} placeholder="What you're playing (optional)" fullWidth />
              <IconButton variant="tertiary" size="small" aria-label={`Remove stream ${i + 1}`} onClick={() => removeSlot(i)}><Icon name="x" size="18" /></IconButton>
            </div>
          ))}
          <div><Button variant="secondary" size="small" onClick={addSlot}>Add a stream time</Button></div>
        </div>
      )}
    </div>
  );
}
