"use client";

/**
 * Platform admin ▸ Events ▸ Ticket sales (staff): GameShuffle's own view of
 * paid events. What sold, the fees collected, who is driving them, and how many
 * organizers have a payout account that works.
 *
 * Fees here are what was charged at purchase time (frozen on each order), not a
 * recalculation from today's levers, so the history stays honest after a
 * pricing change. Data from /api/admin/ticketing; whether paid entry is on at
 * all comes from the platform switches (/api/admin/platform-flags).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert, AreaChart, EmptyState, Select, StatCard,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCash, IconReceiptRefund, IconTicket, IconUserCheck, IconUserCog, IconUsers, IconCoins } from "@tabler/icons-react";
import type { PlatformTicketing } from "@/lib/events/analytics";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdShort = (c: number) => (c >= 100_000 ? `$${Math.round(c / 100).toLocaleString()}` : usd(c));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (x: number) => x.toLocaleString();

function change(now: number, before: number): number | undefined {
  if (before <= 0) return undefined;
  return Math.round(((now - before) / before) * 100);
}

function day(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const PERIODS = [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }];

export function PlatformTicketingTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PlatformTicketing | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  // null = not known (still loading or the switches didn't load): say nothing.
  const [paidEntryOn, setPaidEntryOn] = useState<boolean | null>(null);
  const loading = loadedDays !== days;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ticketing?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PlatformTicketing | null) => { if (cancelled) return; if (j) { setData(j); setFailed(false); } else setFailed(true); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoadedDays(days); });
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/platform-flags", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ok?: boolean; flags?: { key: string; enabled: boolean }[] } | null) => {
        if (cancelled || !d?.ok || !Array.isArray(d.flags)) return;
        setPaidEntryOn(!!d.flags.find((f) => f.key === "paid_tickets_enabled")?.enabled);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const vs = `vs the ${days} days before`;
  const empty = !!data && data.totals.tickets === 0 && data.series.every((p) => p.grossCents === 0);

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Ticket sales"
        intro="Paid tickets for tournaments and game nights across GameShuffle: what sold, the fees collected and which organizers can get paid."
        actions={
          <Select floatingLabel="Period" size="small" value={String(days)} onChange={(v) => setDays(Number(v))} options={PERIODS} />
        }
      />

      {paidEntryOn === false && (
        <Alert variant="info" title="Paid event entry is switched off">
          Organizers can&apos;t sell paid tickets or set up payouts right now. Events that already sold tickets keep
          their orders. It stays off until the tax and organizer agreement questions are answered; then an admin turns on Paid event tickets on
          the <Link href="/account/platform?tab=platform-switches">Switches</Link> screen.
        </Alert>
      )}

      {failed && !data && <Alert variant="error">Couldn&apos;t load ticket sales. Pick the period again or come back in a minute.</Alert>}
      {loading && !data && !failed && <LoadingLines label="Loading ticket sales" />}

      {data && (
        <>
          {failed && <Alert variant="error">Couldn&apos;t load that period. These numbers are still the last {data.days} days.</Alert>}

          <AdminStats label={`Ticket sales, last ${data.days} days`}>
            <StatCard label="Ticket sales" value={usdShort(data.totals.grossCents)} change={change(data.totals.grossCents, data.previous.grossCents)} changeLabel={vs} icon={<IconCash size={20} />} />
            <StatCard label="Fees collected" value={usdShort(data.totals.feesCents)} change={change(data.totals.feesCents, data.previous.feesCents)} changeLabel={vs} icon={<IconCoins size={20} />} variant="accent" />
            <StatCard label="Tickets sold" value={n(data.totals.tickets)} change={change(data.totals.tickets, data.previous.tickets)} changeLabel={vs} icon={<IconTicket size={20} />} />
            <StatCard label="Refund rate" value={pct(data.totals.refundRate)} source={`${usd(data.totals.refundedCents)} refunded`} icon={<IconReceiptRefund size={20} />} />
          </AdminStats>

          <AdminSection
            title="Sales and fees by day"
            intro="Fees are GameShuffle's fee plus card processing, as each buyer was charged at the time, so a later price change doesn't rewrite them."
          >
            <div className="admin-chart">
              {empty ? (
                <p className="admin-chart__empty">No ticket sales in the last {data.days} days.</p>
              ) : (
                <AreaChart
                  data={data.series.map((p) => ({ date: day(p.date), Sales: p.grossCents / 100, Fees: p.feesCents / 100 }))}
                  series={[{ dataKey: "Sales", color: "var(--primary-ink-500)" }, { dataKey: "Fees", color: "var(--accent-500)" }]}
                  xAxisKey="date" height={220} showLegend valueFormatter={(v) => `$${v.toFixed(2)}`}
                />
              )}
            </div>
          </AdminSection>

          <AdminSection title="Organizers and payouts" intro="Organizers need a working payout account to receive what their tickets sell for.">
            <AdminStats label="Organizers and payout accounts" columns={3}>
              <StatCard label="Organizers selling" value={n(data.totals.organizers)} source={`${n(data.totals.events)} ${data.totals.events === 1 ? "event" : "events"} with sales`} icon={<IconUsers size={20} />} />
              <StatCard label="Payout accounts ready" value={n(data.connect.ready)} source={`${n(data.connect.accounts)} set up in all`} icon={<IconUserCheck size={20} />} />
              <StatCard label="Still setting up" value={n(data.connect.pending)} source="Started but can't be paid yet" icon={<IconUserCog size={20} />} />
            </AdminStats>
          </AdminSection>

          <div className="admin-cols">
            <AdminSection title="Top organizers">
              {data.topOrganizers.length === 0 ? (
                <EmptyState variant="bordered" icon={<IconUsers size={28} />} title="No sales yet" description={`Organizers show here, biggest first, once they sell tickets in the last ${data.days} days.`} />
              ) : (
                <AdminTable label="Top organizers by ticket sales">
                  <Table variant="striped" dense>
                    <TableHeader><TableRow><TableHead>Organizer</TableHead><TableHead align="right">Tickets</TableHead><TableHead align="right">Sales</TableHead><TableHead align="right">Fees</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.topOrganizers.map((o) => (
                        <TableRow key={o.userId}>
                          <TableCell>{o.name}</TableCell>
                          <TableCell align="right" className="admin-num">{n(o.tickets)}</TableCell>
                          <TableCell align="right" className="admin-num">{usd(o.grossCents)}</TableCell>
                          <TableCell align="right" className="admin-num">{usd(o.feesCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
              )}
            </AdminSection>

            <AdminSection title="Top events">
              {data.topEvents.length === 0 ? (
                <EmptyState variant="bordered" icon={<IconTicket size={28} />} title="No sales yet" description={`Events show here, biggest first, once they sell tickets in the last ${data.days} days.`} />
              ) : (
                <AdminTable label="Top events by ticket sales">
                  <Table variant="striped" dense>
                    <TableHeader><TableRow><TableHead>Event</TableHead><TableHead align="right">Tickets</TableHead><TableHead align="right">Sales</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.topEvents.map((e) => (
                        <TableRow key={e.href}>
                          <TableCell><Link href={e.href} className="admin-table__link">{e.title}</Link></TableCell>
                          <TableCell align="right" className="admin-num">{n(e.tickets)}</TableCell>
                          <TableCell align="right" className="admin-num">{usd(e.grossCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
              )}
            </AdminSection>
          </div>
        </>
      )}
    </div>
  );
}
