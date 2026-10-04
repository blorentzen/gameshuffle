"use client";

/**
 * WaitlistCard: a person's side of the waitlist, on the tournament and game
 * night pages (and the offer link page). Renders nothing unless it has
 * something to say:
 *   * full, and you're not in    → "This is full" + Join the waitlist
 *   * waitlisted                 → "You're #3 in line" + Leave
 *   * standby with a spot open   → "A spot is open, first to claim it" + Claim
 *   * offered                    → "A spot opened" + countdown + Claim / Pass
 * Paid events: claiming opens the ticket picker, which buys into the seat the
 * offer is holding.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { timeLeft } from "@/lib/events/waitlistRules";
import type { EventType } from "@/lib/events/calendar";
import type { MyWaitlist } from "@/lib/events/waitlist";

export function WaitlistCard({ type, eventId, signedIn, onChanged, className = "comp-card", token, onPay }: {
  type: EventType;
  eventId: string;
  signedIn: boolean;
  onChanged?: () => void;
  className?: string;
  /** Signed offer link (guests / email): acts through /api/waitlist/[token]. */
  token?: string;
  /** Paid claim: show the ticket picker. Defaults to scrolling to #tickets. */
  onPay?: () => void;
}) {
  const toast = useToast();
  const [me, setMe] = useState<MyWaitlist | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const url = token ? `/api/waitlist/${token}` : `/api/events/${type}/${eventId}/waitlist/me`;

  const load = useCallback(async () => {
    const j = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (j?.me) setMe(j.me as MyWaitlist);
  }, [url]);

  useEffect(() => {
    void load();
    const iv = window.setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    return () => window.clearInterval(iv);
  }, [load]);

  const act = async (action: "join" | "claim" | "pass" | "leave") => {
    setBusy(true);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; pay?: boolean; me?: MyWaitlist; message?: string } | null;
      if (j?.me) setMe(j.me);
      if (j?.pay) {
        toast.info("Pick your ticket to claim the spot. It's held for you.");
        if (onPay) onPay();
        else document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!j?.ok) { toast.error(j?.message ?? "That didn't work. Try again."); return; }
      toast.success(action === "join" ? "You're on the waitlist" : action === "claim" ? "You're in!" : action === "pass" ? "Passed. It goes to the next person." : "You left the waitlist");
      onChanged?.();
    } finally { setBusy(false); }
  };

  if (!me) return null;
  const noun = type === "tournament" ? "spots" : "seats";
  const full = me.capacity != null && (me.seatsTaken >= me.capacity || me.lineLength > 0);
  const inLine = me.status === "waitlisted";

  if (me.status === "offered") {
    const ms = me.offerExpiresAt ? Date.parse(me.offerExpiresAt) - now : null;
    return (
      <div className={`${className} waitlist-card waitlist-card--offer`}>
        <Badge variant="warning" size="small">A spot opened</Badge>
        <p className="waitlist-card__big">It&apos;s yours if you want it</p>
        <p className="waitlist-card__note">
          {ms != null ? <>Claim it in the next <strong>{timeLeft(ms)}</strong> or it goes to the next person in line.</> : "Claim it now or it goes to the next person in line."}
          {me.paid ? " Claiming takes you to tickets, with your spot held." : ""}
        </p>
        <div className="waitlist-card__row">
          <Button variant="primary" disabled={busy} onClick={() => void act("claim")}>Claim my spot</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void act("pass")}>Pass</Button>
        </div>
      </div>
    );
  }

  if (inLine) {
    return (
      <div className={`${className} waitlist-card`}>
        <Badge variant="info" size="small">On the waitlist</Badge>
        {me.spotOpen ? (
          <>
            <p className="waitlist-card__big">A spot is open</p>
            <p className="waitlist-card__note">It starts soon, so the first person on the waitlist to claim it gets it.</p>
            <div className="waitlist-card__row">
              <Button variant="primary" disabled={busy} onClick={() => void act("claim")}>Claim it</Button>
              <Button variant="ghost" disabled={busy} onClick={() => void act("leave")}>Leave the waitlist</Button>
            </div>
          </>
        ) : (
          <>
            <p className="waitlist-card__big">You&apos;re #{me.position ?? "?"} in line</p>
            <p className="waitlist-card__note">
              {me.capacity != null ? `${Math.min(me.seatsTaken, me.capacity)} of ${me.capacity} ${noun} taken. ` : ""}
              {me.standby
                ? "It starts soon: if a spot opens, everyone waiting hears at once and the first to claim it gets it. Checked in at the venue? You're seated first."
                : "If a spot opens, it's offered to you in turn and we'll alert, email and text you."}
            </p>
            <div className="waitlist-card__row">
              <Button variant="ghost" size="small" disabled={busy} onClick={() => void act("leave")}>Leave the waitlist</Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Not in yet: only speak up when it's full (otherwise the page's own join applies).
  if (token || !full || me.status === "going" || me.status === "registered" || me.status === "confirmed" || me.status === "checked_in") return null;
  return (
    <div className={`${className} waitlist-card waitlist-card--full`}>
      <p className="waitlist-card__big">{type === "tournament" ? "This tournament is full" : "This night is full"}</p>
      <p className="waitlist-card__note">
        {me.capacity != null ? `All ${me.capacity} ${noun} are taken` : "It's full"}
        {me.lineLength > 0 ? ` and ${me.lineLength} ${me.lineLength === 1 ? "person is" : "people are"} waiting` : ""}.
        {me.waitlistFull ? " The waitlist is full too." : " Join the waitlist and you'll be offered the next spot that opens, in turn."}
      </p>
      {!me.waitlistFull && (signedIn ? (
        <div className="waitlist-card__row">
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("join")}>Join the waitlist</Button>
        </div>
      ) : (
        <Link href={`/login?redirect=${encodeURIComponent(type === "tournament" ? `/tournament/${eventId}` : `/game-nights/${eventId}`)}`} className="waitlist-card__link">Sign in to join the waitlist</Link>
      ))}
    </div>
  );
}
