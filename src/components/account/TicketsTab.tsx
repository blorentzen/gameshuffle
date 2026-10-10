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
                  <Badge size="small" variant="default">{t.status === "refunded" ? "Refunded" : "Event over"}</Badge>
                ) : (
                  <span className="stuff-cell__actions">
                    <Button size="small" variant="secondary" onClick={() => router.push(t.href)} aria-label={`Show ticket for ${t.title}`}>Show ticket</Button>
                    {t.refundable.ok && (
                      <AdminRowMenu label={`More for ${t.title}`} items={[{ label: "Refund", onClick: () => setConfirming(t) }]} />
                    )}
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
    </AdminScreen>
  );
}
