"use client";

/**
 * Fixing your own time (picks 2026-11-08): the time, its laps and its category, until it's verified. Inline in the
 * time's window (a window inside a window is hard to use on a phone). The server runs the same checks as a new time;
 * the change goes back to a reviewer, and vouches for the old numbers are cleared.
 */

import { useState } from "react";
import { Button, FormField, Input } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { ITEMS, vehicleOptions } from "@/lib/timeTrials/categories";
import { formatLap, formatTime, parseLap, parseTime } from "@/lib/timeTrials/rules";
import type { TtTimeDetail } from "@/lib/timeTrials/detail";

const ERRORS: Record<string, string> = {
  bad_time: "Type the time like 1:38.040.",
  bad_laps: "The laps need to add up to the time. Fix a lap, or clear them.",
  faster_than_record: "That's faster than the world record for this track. Check the time.",
  verified: "This time is verified, so it can't be changed.",
  imported: "Times brought over from the records can't be changed here.",
  unchanged: "Nothing changed.",
  not_ready: "Fixing times isn't open yet.",
  slow_down: "That's a lot of changes. Try again later.",
};

export function TtFixTime({ time, onDone, onCancel }: { time: TtTimeDetail; onDone: () => void; onCancel: () => void }) {
  const [raw, setRaw] = useState(formatTime(time.timeMs));
  const [cc, setCc] = useState(String(time.cc));
  const [items, setItems] = useState<string>(time.items);
  const [vehicle, setVehicle] = useState<string>(time.vehicle);
  const [laps, setLaps] = useState<string[]>(time.laps?.map(formatLap) ?? []);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const vehicles = vehicleOptions(time.game);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (parseTime(raw) == null) { toast.error(ERRORS.bad_time); return; }
    const lapMs = laps.map(parseLap);
    if (laps.length && lapMs.some((l) => l == null)) { toast.error("Type each lap like 32.105."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/time-trials/${time.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fix", time: raw, cc: Number(cc), items, vehicle, laps: laps.length ? lapMs : [] }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { toast.error(ERRORS[j.error ?? ""] ?? "That didn't save. Try again."); return; }
      toast.success("Saved. A reviewer checks it again.");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tt-fix" onSubmit={save}>
      <h3 className="tt-fix__title">Fix the time</h3>
      <div className="tt-fix__grid">
        <FormField label="Time" htmlFor="tt-fix-time">
          <Input id="tt-fix-time" value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" autoComplete="off" fullWidth />
        </FormField>
        {time.classes.length > 1 && (
          <FormField label="Speed" htmlFor="tt-fix-cc">
            <Select id="tt-fix-cc" value={cc} onChange={(v) => setCc(String(v))} options={time.classes.map((c) => ({ value: String(c), label: `${c}cc` }))} fullWidth />
          </FormField>
        )}
        <FormField label="Items" htmlFor="tt-fix-items">
          <Select id="tt-fix-items" value={items} onChange={(v) => setItems(String(v))} options={ITEMS.map((i) => ({ value: i.id, label: i.label }))} fullWidth />
        </FormField>
        {vehicles.length > 1 && (
          <FormField label="Vehicle" htmlFor="tt-fix-vehicle">
            <Select id="tt-fix-vehicle" value={vehicle} onChange={(v) => setVehicle(String(v))} options={vehicles.map((v) => ({ value: v.id, label: v.long }))} fullWidth />
          </FormField>
        )}
      </div>
      {laps.length > 0 && (
        <fieldset className="tt-fix__laps">
          <legend>Laps</legend>
          <div className="tt-fix__lapgrid">
            {laps.map((l, i) => (
              <FormField key={i} label={`Lap ${i + 1}`} htmlFor={`tt-fix-lap-${i}`}>
                <Input id={`tt-fix-lap-${i}`} value={l} onChange={(e) => setLaps(laps.map((x, j) => (j === i ? e.target.value : x)))} inputMode="decimal" autoComplete="off" fullWidth />
              </FormField>
            ))}
          </div>
          <Button type="button" variant="ghost" size="small" onClick={() => setLaps([])}>Clear the laps</Button>
        </fieldset>
      )}
      <p className="tt-note">A reviewer checks it again, and vouches for the old time are cleared.</p>
      <div className="tt-add__actions">
        <Button type="submit" variant="primary" loading={busy}>Save the change</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
