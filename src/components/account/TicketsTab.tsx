"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Modal } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { MyTicket } from "@/lib/events/tickets";

/**
 * "My Tickets": everything the signed-in account has paid for, so a buyer who
 * closed the tab can still find the door code and cancel within the policy.
 * The QR itself lives on the event page, which is what gets scanned.
 */

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

function when(iso: string | null): string {
  if (!iso) return "Date to be announced";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const REFUSALS: Record<string, string> = {
  no_refunds: "This organizer doesn't offer refunds.",
  window_closed: "The refund window has closed.",
  not_paid: "Nothing to refund.",
};

export function TicketsTab() {
  const toast = useToast();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [confirming, setConfirming] = useState<MyTicket | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/events/my-tickets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tickets?: MyTicket[] } | null) => setTickets(j?.tickets ?? []))
      .catch(() => setTickets([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const refund = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/events/orders/${confirming.orderId}/refund`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asOrganizer: false }),
      });
      const j = (await r.json().catch(() => null)) as { refundedCents?: number; error?: string } | null;
      if (!r.ok) { toast.error(REFUSALS[j?.error ?? ""] ?? "Couldn't refund that ticket"); return; }
      toast.success(j?.refundedCents ? `Refunded ${usd(j.refundedCents)}` : "Refunded");
      setConfirming(null);
      load();
    } finally { setBusy(false); }
  };

  if (tickets === null) return <p className="attendees__empty">Loading…</p>;
  if (tickets.length === 0) {
    return (
      <div className="account-card">
        <h2 className="account-card__title">My Tickets</h2>
        <p className="account-card__hint">
          Tickets you buy for tournaments and game nights show up here. <Link href="/game-nights">Find something to play</Link>.
        </p>
      </div>
    );
  }

  const upcoming = tickets.filter((t) => t.status === "paid");
  const past = tickets.filter((t) => t.status !== "paid");

  const row = (t: MyTicket) => (
    <Card key={t.orderId} padding="medium">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <Link href={t.href} style={{ fontWeight: "var(--font-weight-bold)" }}>{t.title}</Link>
          <p style={{ margin: "2px 0 0", fontSize: "var(--font-size-13, 13px)", color: "var(--text-secondary)" }}>
            {when(t.startsAt)} · {t.quantity} × {t.tierName} · {usd(t.paidCents)}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
            {t.status === "refunded" ? "Refunded" : t.refundTerms}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
          {t.status === "refunded" ? <Badge variant="default">Refunded</Badge> : <Link href={t.href}><Button size="small" variant="secondary">View ticket</Button></Link>}
          {t.status === "paid" && t.refundable.ok && (
            <Button size="small" variant="ghost" onClick={() => setConfirming(t)}>Refund</Button>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="account-card">
      <h2 className="account-card__title">My Tickets</h2>
      <p className="account-card__hint">Show the QR code on the event page at the door.</p>

      <div style={{ display: "grid", gap: "var(--spacing-8)", marginTop: "var(--spacing-12)" }}>{upcoming.map(row)}</div>

      {past.length > 0 && (
        <>
          <h3 style={{ margin: "var(--spacing-20) 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Past orders</h3>
          <div style={{ display: "grid", gap: "var(--spacing-8)" }}>{past.map(row)}</div>
        </>
      )}

      <Modal isOpen={!!confirming} onClose={() => setConfirming(null)} title="Refund this ticket?" size="small"
        primaryAction={{ label: busy ? "Refunding…" : "Refund", onClick: () => { if (!busy) void refund(); } }}
        secondaryAction={{ label: "Keep it", onClick: () => setConfirming(null) }}>
        {confirming && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
            <p style={{ margin: 0 }}>
              You&apos;ll get <strong>{usd(confirming.refundAmountCents)}</strong> back for {confirming.title}, and your seat goes to the next person.
            </p>
            {confirming.refundAmountCents < confirming.paidCents && (
              <Alert variant="info">
                Fees of {usd(confirming.paidCents - confirming.refundAmountCents)} aren&apos;t refunded. They come back in full only if the organizer cancels.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
