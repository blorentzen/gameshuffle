"use client";

/**
 * Fixing your own time (picks 2026-11-08): the time, its laps and its category, until it's verified. Inline in the
 * time's window (a window inside a window is hard to use on a phone). The server runs the same checks as a new time;
 * the change goes back to a reviewer, and vouches for the old numbers are cleared.
 *
 * With `reviewer` (picks 2026-11-09): a reviewer fixing someone's time, from the clips queue or the time's window,
 * with a note for the player and Save and verify (when there's proof on file) or Save only.
 */

import { useState } from "react";
import { Button, FormField, Input } from "@empac/cascadeds";
import { IconCircleCheck } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { hasItems, ITEMS, savableVehicles } from "@/lib/timeTrials/categories";
import { formatLap, formatTime, parseLap, parseTime } from "@/lib/timeTrials/rules";
import { TT_GAMES } from "@/lib/timeTrials/tracks";
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
  bad_class: "Pick a speed, items and vehicle for this game.",
  gone: "This time changed or was removed. Open it again.",
  no_proof: "There's no clip, screenshot or record link to verify it from. Save it without verifying.",
  own: "You can fix your own time as its player, not as a reviewer.",
  not_reviewer: "You don't check this game and items.",
};

/** What the form needs from a time (the window's detail, or a clips queue row). */
export type FixTarget = Pick<TtTimeDetail, "id" | "game" | "timeMs" | "cc" | "items" | "vehicle" | "laps" | "classes">;

export function TtFixTime({ time, onDone, onCancel, reviewer, bare = false }: {
  time: FixTarget; onDone: () => void; onCancel: () => void;
  /** Leave out the form's own heading (the time window's reviewer box already has one). */
  bare?: boolean;
  /** A reviewer fixing someone else's time: their name, and whether there's proof to verify it from. */
  reviewer?: { name: string; canVerify: boolean };
}) {
  const [raw, setRaw] = useState(formatTime(time.timeMs));
  const [cc, setCc] = useState(String(time.cc));
  const [items, setItems] = useState<string>(time.items);
  const [vehicle, setVehicle] = useState<string>(time.vehicle);
  const [laps, setLaps] = useState<string[]>(time.laps?.map(formatLap) ?? []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"verify" | "save" | null>(null);
  const toast = useToast();
  // Kirby Air Riders: no items, and the machine the time was set on.
  const kirby = !hasItems(time.game);
  const vehicles = savableVehicles(time.game);

  const who = reviewer && reviewer.name !== "A player" ? reviewer.name : null;
  // Save and verify is the main button when there's proof to verify from (the form's Enter key does it too).
  const verifyFirst = !!reviewer?.canVerify;

  async function save(verify: boolean) {
    if (parseTime(raw, TT_GAMES[time.game].minMs) == null) { toast.error(ERRORS.bad_time); return; }
    const lapMs = laps.map(parseLap);
    if (laps.length && lapMs.some((l) => l == null)) { toast.error("Type each lap like 32.105."); return; }
    setBusy(verify ? "verify" : "save");
    try {
      const fields = { time: raw, cc: Number(cc), items, vehicle, laps: laps.length ? lapMs : [] };
      const res = reviewer
        ? await fetch("/api/time-trials/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix", timeId: time.id, ...fields, note: note.trim(), verify }) })
        : await fetch(`/api/time-trials/${time.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix", ...fields }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { toast.error(ERRORS[j.error ?? ""] ?? "That didn't save. Try again."); return; }
      toast.success(!reviewer ? "Saved. A reviewer checks it again." : verify ? `Fixed and verified. ${who ?? "The player"} gets a message.` : `Fixed. ${who ?? "The player"} gets a message.`);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className="tt-fix" onSubmit={(e) => { e.preventDefault(); void save(verifyFirst); }}>
      {!bare && <h3 className="tt-fix__title">{who ? `Fix ${who}'s time` : "Fix the time"}</h3>}
      <div className="tt-fix__grid">
        <FormField label="Time" htmlFor={`tt-fix-time-${time.id}`}>
          <Input id={`tt-fix-time-${time.id}`} value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" autoComplete="off" fullWidth />
        </FormField>
        {time.classes.length > 1 && (
          <FormField label="Speed" htmlFor={`tt-fix-cc-${time.id}`}>
            <Select id={`tt-fix-cc-${time.id}`} value={cc} onChange={(v) => setCc(String(v))} options={time.classes.map((c) => ({ value: String(c), label: `${c}cc` }))} fullWidth />
          </FormField>
        )}
        {!kirby && <FormField label="Items" htmlFor={`tt-fix-items-${time.id}`}>
          <Select id={`tt-fix-items-${time.id}`} value={items} onChange={(v) => setItems(String(v))} options={ITEMS.map((i) => ({ value: i.id, label: i.label }))} fullWidth />
        </FormField>}
        {vehicles.length > 1 && (
          <FormField label={kirby ? "Machine" : "Vehicle"} htmlFor={`tt-fix-vehicle-${time.id}`}>
            <Select id={`tt-fix-vehicle-${time.id}`} value={vehicle} onChange={(v) => setVehicle(String(v))} options={vehicles.map((v) => ({ value: v.id, label: v.long }))} fullWidth />
          </FormField>
        )}
      </div>
      {laps.length > 0 && (
        <fieldset className="tt-fix__laps">
          <legend>Laps</legend>
          <div className="tt-fix__lapgrid">
            {laps.map((l, i) => (
              <FormField key={i} label={`Lap ${i + 1}`} htmlFor={`tt-fix-lap-${time.id}-${i}`}>
                <Input id={`tt-fix-lap-${time.id}-${i}`} value={l} onChange={(e) => setLaps(laps.map((x, j) => (j === i ? e.target.value : x)))} inputMode="decimal" autoComplete="off" fullWidth />
              </FormField>
            ))}
          </div>
          <Button type="button" variant="ghost" size="small" onClick={() => setLaps([])}>Clear the laps</Button>
        </fieldset>
      )}
      {reviewer ? (
        <>
          <FormField label={`Note for ${who ?? "the player"} (optional)`} htmlFor={`tt-fix-note-${time.id}`}>
            <Input id={`tt-fix-note-${time.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Your screenshot shows 1:38.040." autoComplete="off" fullWidth />
          </FormField>
          <p className="tt-note">
            {`${who ?? "The player"} gets a message with the old and new time, and can reply if it's wrong. The change shows in the time's history.`}
            {!reviewer.canVerify && " There's no clip or screenshot on file, so it stays unverified."}
          </p>
          <div className="tt-add__actions">
            {verifyFirst && <Button type="submit" variant="primary" iconBefore={IconCircleCheck} loading={busy === "verify"} disabled={!!busy}>Save and verify</Button>}
            <Button type={verifyFirst ? "button" : "submit"} variant={verifyFirst ? "secondary" : "primary"} loading={busy === "save"} disabled={!!busy} onClick={verifyFirst ? () => void save(false) : undefined}>{verifyFirst ? "Save only" : "Save the change"}</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          <p className="tt-note">A reviewer checks it again, and vouches for the old time are cleared.</p>
          <div className="tt-add__actions">
            <Button type="submit" variant="primary" loading={busy === "save"}>Save the change</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </>
      )}
    </form>
  );
}
