"use client";

/**
 * Plans & billing: an account's monthly support for GameShuffle, with the
 * Stripe Customer Portal to change or stop it (/api/stripe/portal; the
 * support subscription sits on the account's own Stripe customer). Nothing
 * shows without monthly support.
 */

import { useEffect, useState } from "react";
import { Button, Card } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { dollars } from "@/lib/support/rules";

interface Monthly { amountCents: number; status: string; cancelAtPeriodEnd: boolean; renewsAt: string | null }

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" });

export function MonthlySupportCard() {
  const toast = useToast();
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/support/status").then((r) => (r.ok ? r.json() : null)).then((s: { monthly?: Monthly | null } | null) => { if (alive && s?.monthly) setMonthly(s.monthly); }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, []);

  if (!monthly) return null;
  const manage = async () => {
    setBusy(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { url?: string }) : null;
    if (res?.ok && body?.url) { window.location.assign(body.url); return; }
    setBusy(false);
    toast.error("Couldn't open billing. Try again in a moment.");
  };
  return (
    <Card variant="outlined" padding="medium" className="support-card">
      <h3 className="support-card__title">Monthly support</h3>
      <p className="support-card__text">
        You support GameShuffle with {dollars(monthly.amountCents)} a month.{" "}
        {monthly.renewsAt ? (monthly.cancelAtPeriodEnd ? `It stops after ${when(monthly.renewsAt)}.` : `Next payment ${when(monthly.renewsAt)}.`) : ""}
        {monthly.status === "past_due" ? " The last payment didn't go through: update your card to keep it going." : ""} Thank you.
      </p>
      <div><Button variant="secondary" size="small" onClick={() => void manage()} disabled={busy}>{busy ? "Opening…" : "Change or stop"}</Button></div>
    </Card>
  );
}
