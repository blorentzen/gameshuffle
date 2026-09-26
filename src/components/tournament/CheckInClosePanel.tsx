"use client";

/**
 * The drop-or-keep step, once check-in has closed.
 *
 * The spec's rule, and the reason this is a panel rather than a background job:
 * nothing is removed automatically. An organizer who arrives to find the
 * platform has silently cut four people from their bracket has lost control of
 * their own event, and no amount of "it was in the settings" fixes that.
 *
 * So both outcomes are explicit buttons, "Keep" is a real action rather than
 * walking away, and the default selection is nobody.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { checkInWindow, checkInMessage } from "@/lib/events/checkInWindow";

interface Unchecked { id: string; display_name: string; user_id: string | null; status: string }

export function CheckInClosePanel({
  tournamentId, startsAt, enabled, opensMinutes,
}: {
  tournamentId: string;
  startsAt: string | null;
  enabled?: boolean | null;
  opensMinutes?: number | null;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Unchecked[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const win = checkInWindow({ enabled, opensMinutes, startsAt });

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/check-in/sweep`, { cache: "no-store" });
    if (!res.ok) { setRows([]); return; }
    const { unchecked } = await res.json();
    setRows(unchecked ?? []);
  }, [tournamentId]);

  useEffect(() => { void load(); }, [load]);

  // Nothing to say before the window has been and gone.
  if (win.phase === "disabled" || win.phase === "no_start_time") return null;
  if (!rows) return null;

  const act = async (action: "drop" | "keep") => {
    const ids = [...picked];
    if (ids.length === 0) { toast.info("Select who this applies to first."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/check-in/sweep`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, participantIds: ids }),
      });
      if (!res.ok) { toast.error("Couldn't do that."); return; }
      toast.success(action === "drop"
        ? `${ids.length} removed from the field.`
        : `${ids.length} kept in.`);
      setPicked(new Set());
      await load();
    } finally { setBusy(false); }
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div className="checkin-close">
      <div className="checkin-close__head">
        <span className="checkin-close__title">Check-in</span>
        <span className="checkin-close__state">{checkInMessage(win) ?? ""}</span>
      </div>

      {rows.length === 0 ? (
        <p className="checkin-close__empty">
          {win.phase === "closed" ? "Everyone checked in." : "Everyone has checked in so far."}
        </p>
      ) : win.phase !== "closed" ? (
        <p className="checkin-close__empty">
          {rows.length} {rows.length === 1 ? "entrant has" : "entrants have"} not checked in yet.
          You can decide what to do with them once check-in closes.
        </p>
      ) : (
        <>
          <p className="checkin-close__lede">
            {rows.length} {rows.length === 1 ? "entrant" : "entrants"} never checked in. Nothing has
            been changed: choose what happens to them.
          </p>
          <ul className="checkin-close__list">
            {rows.map((r) => (
              <li key={r.id}>
                <Checkbox
                  checked={picked.has(r.id)}
                  onChange={() => toggle(r.id)}
                  label={r.display_name + (r.user_id ? "" : " (guest)")}
                />
              </li>
            ))}
          </ul>
          <div className="checkin-close__actions">
            <Button variant="secondary" size="small" onClick={() => setPicked(new Set(rows.map((r) => r.id)))}>
              Select all
            </Button>
            <Button variant="secondary" size="small" loading={busy} onClick={() => void act("keep")}>
              Keep in the field
            </Button>
            <Button variant="ghost" size="small" loading={busy} onClick={() => void act("drop")}>
              Remove from the field
            </Button>
          </div>
          <p className="checkin-close__note">
            Removing marks them dropped rather than deleting them, so the entry stays in their
            history as a no-show. Anyone who withdrew before the event is not listed here.
          </p>
        </>
      )}
    </div>
  );
}
