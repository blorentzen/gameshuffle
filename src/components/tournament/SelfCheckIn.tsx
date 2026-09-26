"use client";

/**
 * The player's half of check-in.
 *
 * Without this the window has no door: an organizer could open check-in and the
 * only way through it was them tapping every name themselves, which is the
 * situation check-in exists to remove.
 *
 * Deliberately says what checking in does and does not do. Someone who thinks a
 * tap here excuses not turning up will be surprised later, and the attendance
 * record keying on having played is the sort of thing that feels like a trick
 * if nobody mentioned it.
 */

import { useState } from "react";
import { Button, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { checkInWindow, checkInMessage } from "@/lib/events/checkInWindow";
import { reasonsFor, FEEDBACK_DISCLOSURE } from "@/data/attendance-reasons";

export function SelfCheckIn({
  tournamentId, startsAt, enabled, opensMinutes, checkedIn, onChanged,
}: {
  tournamentId: string;
  startsAt: string | null;
  enabled?: boolean | null;
  opensMinutes?: number | null;
  checkedIn: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");

  const win = checkInWindow({ enabled, opensMinutes, startsAt });
  if (win.phase === "disabled" || win.phase === "no_start_time") return null;

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/check-in`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error ?? "That didn't work."); return false; }
      toast.success(okMsg);
      onChanged?.();
      return true;
    } finally { setBusy(false); }
  };

  return (
    <div className="self-checkin">
      <p className="self-checkin__state">{checkInMessage(win)}</p>

      {checkedIn ? (
        <p className="self-checkin__done">You&rsquo;re checked in. See you there.</p>
      ) : win.canCheckIn ? (
        <>
          <Button variant="primary" loading={busy} onClick={() => void post({ action: "check_in" }, "Checked in.")}>
            I&rsquo;m here
          </Button>
          <p className="self-checkin__note">
            This tells the organizer you&rsquo;re around before they set the draw. Your result still
            comes from the races you play.
          </p>
        </>
      ) : null}

      {/* Withdrawing stays available right up to the start. Making it easy is
          the point: an early withdrawal is what an organizer wants, and it is
          recorded differently from never turning up. */}
      {!withdrawing ? (
        <button type="button" className="self-checkin__withdraw" onClick={() => setWithdrawing(true)}>
          Can&rsquo;t make it?
        </button>
      ) : (
        <div className="self-checkin__withdraw-form">
          <p className="self-checkin__note">
            Letting the organizer know now is better than not turning up, and it is recorded
            differently.
          </p>
          <label className="account-card__label" htmlFor="withdraw-reason">Why, if you don&rsquo;t mind saying</label>
          <Select
            value={reason}
            onChange={(v) => setReason(typeof v === "string" ? v : v[0] ?? "")}
            options={[{ value: "", label: "Rather not say" }, ...reasonsFor("withdraw").map((r) => ({ value: r.value, label: r.label }))]}
            fullWidth
          />
          <p className="self-checkin__note">{FEEDBACK_DISCLOSURE}</p>
          <div className="self-checkin__actions">
            <Button
              variant="secondary" size="small" loading={busy}
              onClick={async () => {
                const ok = await post({ action: "withdraw", reason: reason || undefined }, "You've been withdrawn.");
                if (ok) setWithdrawing(false);
              }}
            >Withdraw from this tournament</Button>
            <Button variant="ghost" size="small" onClick={() => setWithdrawing(false)}>Never mind</Button>
          </div>
        </div>
      )}
    </div>
  );
}
