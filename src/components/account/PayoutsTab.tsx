"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AreaChart, Card, DonutChart, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { AdminScreen, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { ConnectAccountCard } from "@/components/events/ConnectAccountCard";
import { PaidEntryNotice } from "@/components/billing/PaidEntryNotice";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import type { OrganizerAnalytics } from "@/lib/events/analytics";
import { LoadingLines } from "@/components/loading/LoadingLines";

/**
 * "Payouts": the organizer's money in one place. Stripe account state, what is
 * on its way to their bank, and how tickets are actually selling.
 *
 * Headline numbers are free. The daily trend and ticket mix are a paid Circuit
 * organizer feature, and the server decides that (`detailed`), not this file.
 */

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const usdShort = (c: number) => (c >= 100_000 ? `$${Math.round(c / 100).toLocaleString()}` : usd(c));

function change(now: number, before: number): number | undefined {
  if (before <= 0) return undefined;
  return Math.round(((now - before) / before) * 100);
}

function day(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PayoutsTab() {
  const availability = usePaidAvailability();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ detailed: boolean; analytics: OrganizerAnalytics } | null>(null);
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  // Derived rather than a state write inside the effect, which would cascade renders.
  const loading = loadedDays !== days;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/connect/analytics?days=${days}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setData(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadedDays(days); });
    return () => { cancelled = true; };
  }, [days]);

  const a = data?.analytics;
  const detailed = !!data?.detailed;
  const sold = (a?.totals.tickets ?? 0) > 0;
  const series = a?.series ?? [];

  // Paid entry off and nothing ever sold: just say so.
  if (availability && !availability.paidEntry && !sold && !a?.payouts?.recent.length) {
    return (
      <AdminScreen title="Payouts" intro="Where ticket money lands once paid entry is on.">
        <PaidEntryNotice />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen
      title="Payouts"
      intro="Where ticket money lands. Prices and refund rules live on each event's manage page."
      actions={
        <Select aria-label="Time period" value={String(days)} onChange={(v) => setDays(Number(v))}
          options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
      }
    >
      <ConnectAccountCard intro="Selling tickets to a tournament or game night? Connect a payout account with Stripe. It takes a couple of minutes, and GameShuffle never touches your bank details." />

      {/* On its way to the bank */}
      {a?.payouts && (a.payouts.availableCents > 0 || a.payouts.pendingCents > 0 || a.payouts.recent.length > 0) && (
        <Card padding="medium" className="payouts__balance">
          <div style={{ display: "flex", gap: "var(--spacing-20)", flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <span className="account-card__label">Available</span>
              <p style={{ margin: 0, fontSize: "var(--font-size-20)", fontWeight: "var(--font-weight-bold)", fontVariantNumeric: "tabular-nums" }}>{usd(a.payouts.availableCents)}</p>
            </div>
            <div>
              <span className="account-card__label">On the way</span>
              <p style={{ margin: 0, fontSize: "var(--font-size-20)", fontWeight: "var(--font-weight-bold)", fontVariantNumeric: "tabular-nums" }}>{usd(a.payouts.pendingCents)}</p>
            </div>
            {a.payouts.recent.length > 0 && (
              <div style={{ minWidth: "12rem" }}>
                <span className="account-card__label">Recent payouts</span>
                <ul style={{ margin: "2px 0 0", padding: 0, listStyle: "none", fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
                  {a.payouts.recent.slice(0, 3).map((p) => (
                    <li key={p.id} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {usd(p.amountCents)} · {p.status}{p.arrivalDate ? ` · ${new Date(p.arrivalDate).toLocaleDateString()}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {loading && !a && <LoadingLines label="Loading" />}

      {a && !sold && !loading && (
        <p className="admin-field__help">No ticket sales in this window. Add a ticket type on any event you organize to start charging.</p>
      )}

      {a && sold && (
        <>
          <AdminStats columns={3} label="Ticket sales">
            <StatCard label="Collected" value={usdShort(a.totals.grossCents)} change={change(a.totals.grossCents, a.previous.grossCents)} changeLabel={`vs previous ${days} days`}
              sparklineData={series.map((p) => p.grossCents)} sparklineType="area" />
            <StatCard label="Yours after fees" value={usdShort(a.totals.netCents)} change={change(a.totals.netCents, a.previous.netCents)} changeLabel={`vs previous ${days} days`} variant="accent" />
            <StatCard label="Tickets sold" value={String(a.totals.tickets)} change={change(a.totals.tickets, a.previous.tickets)} changeLabel={`vs previous ${days} days`}
              sparklineData={series.map((p) => p.tickets)} sparklineType="bar" />
            <StatCard label="Average order" value={usd(a.totals.avgOrderCents)} variant="muted" />
            <StatCard label="Refunded" value={usdShort(a.totals.refundedCents)} variant="muted" />
          </AdminStats>

          {detailed ? (
            <>
              <AdminSection title="Sales over time">
              <AreaChart
                data={series.map((p) => ({ date: day(p.date), Collected: p.grossCents / 100, Yours: p.netCents / 100 }))}
                series={[{ dataKey: "Collected", color: "var(--primary-ink-500)" }, { dataKey: "Yours", color: "var(--accent-500)" }]}
                xAxisKey="date" height={220} showLegend valueFormatter={(v) => `$${v.toFixed(2)}`}
              />
              </AdminSection>

              {a.byTier.length > 0 && (
                <AdminSection title="What people are buying">
                  <DonutChart
                    data={a.byTier.map((t) => ({ name: t.name, value: t.tickets }))}
                    height={200} showLegend legendPosition="right" valueFormatter={(v) => `${v} tickets`}
                  />
                </AdminSection>
              )}
            </>
          ) : (
            <Alert variant="info">
              Daily trends and ticket mix come with Circuit. <Link href="/gs-circuit">See Circuit plans</Link>.
            </Alert>
          )}

          <AdminSection title="By event">
            <AdminTable label="Sales by event">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead align="right">Sold</TableHead>
                    <TableHead align="right">Yours</TableHead>
                    <TableHead align="right">Refunded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.byEvent.map((e) => (
                    <TableRow key={`${e.type}:${e.id}`}>
                      <TableCell><Link href={e.href} className="stuff-cell__title">{e.title}</Link></TableCell>
                      <TableCell align="right" className="admin-num">{e.tickets}</TableCell>
                      <TableCell align="right" className="admin-num">{usd(e.netCents)}</TableCell>
                      <TableCell align="right" className="admin-num">{e.refundedCents > 0 ? usd(e.refundedCents) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
          </AdminSection>
        </>
      )}
    </AdminScreen>
  );
}
