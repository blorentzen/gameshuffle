"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, EmptyState, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconTicket } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { MyTicket } from "@/lib/events/tickets";
import { formatEventShort } from "@/lib/time/format";
import { AdminRowMenu, AdminScreen, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";
import { viewerTimeZone } from "@/components/account/stuff/StuffList";
import { LoadingLines } from "@/components/loading/LoadingLines";

/**
 * My Stuff ▸ Purchases ▸ Tickets: everything this account has paid for, so a
 * buyer who closed the tab can still find the door code and cancel within the
 * policy. The QR itself lives on the event page, which is what gets scanned.
 * Coming up = paid and not yet past; everything else (refunded, or the event
 * has been) is Past.
 */

/** A ticket moves to Past half a day after its event starts. */
const PAST_AFTER_MS = 12 * 3600_000;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const REFUSALS: Record<string, string> = {
  no_refunds: "This organizer doesn't offer refunds.",
  window_closed: "The refund window has closed.",
  not_paid: "Nothing to refund.",
};

export function TicketsTab({ timeZone }: { timeZone?: string | null } = {}) {
  const toast = useToast();
  const router = useRouter();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [confirming, setConfirming] = useState<MyTicket | null>(null);
  const [receipt, setReceipt] = useState<MyTicket | null>(null);
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

  const groups = useMemo(() => {
    const list = tickets ?? [];
    const now = Date.now();
    const upcoming = (t: MyTicket) => t.status === "paid" && (!t.startsAt || Date.parse(t.startsAt) > now - PAST_AFTER_MS);
    const at = (t: MyTicket) => (t.startsAt ? Date.parse(t.startsAt) : Number.POSITIVE_INFINITY);
    return {
      upcoming: list.filter(upcoming).sort((a, b) => at(a) - at(b)),
      past: list.filter((t) => !upcoming(t)).sort((a, b) => at(b) - at(a)),
    };
  }, [tickets]);
  const tz = viewerTimeZone(timeZone);

  if (tickets === null) return <AdminScreen title="Tickets"><LoadingLines label="Loading your tickets" /></AdminScreen>;

  const table = (label: string, list: MyTicket[], past: boolean) => (
    <AdminTable label={label}>
      <Table variant="striped" dense>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Tickets</TableHead>
            <TableHead align="right">Paid</TableHead>
            <TableHead align="right">{past ? "Status" : "Actions"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((t) => (
            <TableRow key={t.orderId}>
              <TableCell>
                <Link href={t.href} className="stuff-cell__title">{t.title}</Link>
                {!past && <span className="stuff-cell__sub">{t.refundTerms}</span>}
              </TableCell>
              <TableCell>{t.startsAt ? formatEventShort(t.startsAt, tz) : "Date to be announced"}</TableCell>
              <TableCell>{t.quantity} × {t.tierName}</TableCell>
              <TableCell align="right" className="admin-num">{usd(t.paidCents)}</TableCell>
              <TableCell align="right">
                {past ? (
                  <span className="stuff-cell__actions">
                    <Badge size="small" variant="default">{t.status === "refunded" ? "Refunded" : "Event over"}</Badge>
                    <Button size="small" variant="ghost" onClick={() => setReceipt(t)} aria-label={`Receipt for ${t.title}`}>Receipt</Button>
                  </span>
                ) : (
                  <span className="stuff-cell__actions">
                    <Button size="small" variant="secondary" onClick={() => router.push(t.href)} aria-label={`Show ticket for ${t.title}`}>Show ticket</Button>
                    <AdminRowMenu
                      label={`More for ${t.title}`}
                      items={[
                        { label: "Receipt", onClick: () => setReceipt(t) },
                        ...(t.refundable.ok ? [{ label: "Refund", onClick: () => setConfirming(t) }] : []),
                      ]}
                    />
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTable>
  );

  return (
    <AdminScreen title="Tickets" intro="Tickets you've bought for tournaments and game nights. At the door, show the QR code on the event page.">
      {tickets.length === 0 ? (
        <EmptyState
          variant="bordered"
          icon={<IconTicket size={40} stroke={1.4} />}
          title="No tickets yet"
          description="When you buy a ticket for a tournament or a game night, it shows up here with its QR code."
          action={<Button variant="secondary" onClick={() => router.push("/game-nights")}>Find something to play</Button>}
        />
      ) : (
        <>
          {groups.upcoming.length > 0 && (
            <AdminSection title={`Coming up (${groups.upcoming.length})`}>{table("Tickets coming up", groups.upcoming, false)}</AdminSection>
          )}
          {groups.past.length > 0 && (
            <AdminSection title={`Past (${groups.past.length})`}>{table("Past tickets", groups.past, true)}</AdminSection>
          )}
        </>
      )}

      <Modal isOpen={!!receipt} onClose={() => setReceipt(null)} title="Receipt" size="small"
        primaryAction={{ label: "Print", onClick: () => window.print() }}
        secondaryAction={{ label: "Close", onClick: () => setReceipt(null) }}>
        {receipt && <TicketReceipt t={receipt} tz={tz} />}
      </Modal>

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
                Fees of {usd(confirming.paidCents - confirming.refundAmountCents)}{" "}aren&apos;t refunded. They come back in full only if the organizer cancels.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </AdminScreen>
  );
}

const dateLine = (iso: string | null, tz: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) }) : null;

/** A ticket order as a receipt. Printing shows only this (account.css, @media print). */
function TicketReceipt({ t, tz }: { t: MyTicket; tz: string | null }) {
  const r = t.receipt;
  const discount = r.subtotalCents + r.serviceFeeCents + r.processingFeeCents - r.totalCents;
  return (
    <div className="ticket-receipt">
      <div className="ticket-receipt__head">
        <strong>GameShuffle</strong>
        <span>Order {t.orderId.slice(0, 8).toUpperCase()}</span>
      </div>
      <dl className="ticket-receipt__facts">
        <div><dt>Event</dt><dd>{t.title}</dd></div>
        <div><dt>When</dt><dd>{t.startsAt ? formatEventShort(t.startsAt, tz) : "Date to be announced"}</dd></div>
        <div><dt>Bought</dt><dd>{dateLine(r.paidAt ?? t.purchasedAt, tz)}</dd></div>
        {(r.buyerName || r.buyerEmail) && <div><dt>Buyer</dt><dd>{[r.buyerName, r.buyerEmail].filter(Boolean).join(" · ")}</dd></div>}
      </dl>
      <dl className="ticket-receipt__lines">
        <div><dt>{t.quantity} × {t.tierName} at {usd(r.unitCents)}</dt><dd>{usd(r.subtotalCents)}</dd></div>
        {r.serviceFeeCents > 0 && <div><dt>Service fee</dt><dd>{usd(r.serviceFeeCents)}</dd></div>}
        {r.processingFeeCents > 0 && <div><dt>Card processing</dt><dd>{usd(r.processingFeeCents)}</dd></div>}
        {discount > 0 && <div><dt>Discount</dt><dd>−{usd(discount)}</dd></div>}
        <div className="ticket-receipt__total"><dt>Total paid</dt><dd>{usd(r.totalCents)}</dd></div>
        {t.status === "refunded" && <div><dt>Refunded</dt><dd>{dateLine(r.refundedAt, tz) ?? "Yes"}</dd></div>}
      </dl>
      <p className="ticket-receipt__note">{t.status === "refunded" ? "This order was refunded." : t.refundTerms} Paid by card through Stripe.</p>
    </div>
  );
}
