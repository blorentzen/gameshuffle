"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AreaChart, Card, DonutChart, Select, StatCard } from "@empac/cascadeds";
import { ConnectAccountCard } from "@/components/events/ConnectAccountCard";
import type { OrganizerAnalytics } from "@/lib/events/analytics";

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
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ detailed: boolean; analytics: OrganizerAnalytics } | null>(null);
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  // Derived rather than a state write inside the effect, which would cascade renders.
  const loading = loadedDays !== days;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/connect/analytics?days=${days}`, { cache: "no-store" })
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

  return (
    <div className="account-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 className="account-card__title">Payouts</h2>
          <p className="account-card__hint">Where ticket money lands. Prices and refund rules live on each event&apos;s manage page.</p>
        </div>
        <Select value={String(days)} onChange={(v) => setDays(Number(v))}
          options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
      </div>

      <div style={{ marginTop: "var(--spacing-12)" }}>
        <ConnectAccountCard intro="Selling tickets to a tournament or game night? Connect a payout account with Stripe. It takes a couple of minutes, and GameShuffle never touches your bank details." />
      </div>

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
                <ul style={{ margin: "2px 0 0", padding: 0, listStyle: "none", fontSize: "var(--font-size-13, 13px)", color: "var(--text-secondary)" }}>
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

      {loading && !a && <p className="attendees__empty">Loading…</p>}

      {a && !sold && !loading && (
        <p className="account-card__hint" style={{ marginTop: "var(--spacing-12)" }}>
          No ticket sales in this window. Add a ticket type on any event you organize to start charging.
        </p>
      )}

      {a && sold && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "var(--spacing-12)", marginTop: "var(--spacing-20)" }}>
            <StatCard label="Collected" value={usdShort(a.totals.grossCents)} change={change(a.totals.grossCents, a.previous.grossCents)} changeLabel={`vs previous ${days} days`}
              sparklineData={series.map((p) => p.grossCents)} sparklineType="area" />
            <StatCard label="Yours after fees" value={usdShort(a.totals.netCents)} change={change(a.totals.netCents, a.previous.netCents)} changeLabel={`vs previous ${days} days`} variant="accent" />
            <StatCard label="Tickets sold" value={String(a.totals.tickets)} change={change(a.totals.tickets, a.previous.tickets)} changeLabel={`vs previous ${days} days`}
              sparklineData={series.map((p) => p.tickets)} sparklineType="bar" />
            <StatCard label="Average order" value={usd(a.totals.avgOrderCents)} variant="muted" />
            <StatCard label="Refunded" value={usdShort(a.totals.refundedCents)} variant="muted" />
          </div>

          {detailed ? (
            <>
              <h3 style={{ margin: "var(--spacing-20) 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Sales over time</h3>
              <AreaChart
                data={series.map((p) => ({ date: day(p.date), Collected: p.grossCents / 100, Yours: p.netCents / 100 }))}
                series={[{ dataKey: "Collected", color: "var(--primary-500)" }, { dataKey: "Yours", color: "var(--accent-500)" }]}
                xAxisKey="date" height={220} showLegend valueFormatter={(v) => `$${v.toFixed(2)}`}
              />

              {a.byTier.length > 0 && (
                <>
                  <h3 style={{ margin: "var(--spacing-20) 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>What people are buying</h3>
                  <DonutChart
                    data={a.byTier.map((t) => ({ name: t.name, value: t.tickets }))}
                    height={200} showLegend legendPosition="right" valueFormatter={(v) => `${v} tickets`}
                  />
                </>
              )}
            </>
          ) : (
            <div style={{ marginTop: "var(--spacing-20)" }}>
              <Alert variant="info">
                Daily trends and ticket mix come with Circuit. <Link href="/gs-circuit">See Circuit plans</Link>.
              </Alert>
            </div>
          )}

          <h3 style={{ margin: "var(--spacing-20) 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>By event</h3>
          <div style={{ display: "grid", gap: "var(--spacing-4)" }}>
            {a.byEvent.map((e) => (
              <div key={`${e.type}:${e.id}`} style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-8)", alignItems: "center", padding: "var(--spacing-8) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", fontSize: "var(--font-size-13, 13px)" }}>
                <Link href={e.href}>{e.title}</Link>
                <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {e.tickets} sold · {usd(e.netCents)} yours{e.refundedCents > 0 ? ` · ${usd(e.refundedCents)} refunded` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
