"use client";

/**
 * PlatformTicketing — GameShuffle's own view of paid events: gross ticket
 * volume, the fees the platform actually earned, who is driving them, and how
 * many organizers have a working payout account.
 *
 * Fees here are what was charged at purchase time (frozen on each order), not a
 * recalculation from today's levers, so the history stays honest after a
 * pricing change.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AreaChart, Card, Select, StatCard } from "@empac/cascadeds";
import type { PlatformTicketing } from "@/lib/events/analytics";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const usdShort = (c: number) => (c >= 100_000 ? `$${Math.round(c / 100).toLocaleString()}` : usd(c));
const pct = (n: number) => `${Math.round(n * 100)}%`;

function change(now: number, before: number): number | undefined {
  if (before <= 0) return undefined;
  return Math.round(((now - before) / before) * 100);
}

function day(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PlatformTicketingTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PlatformTicketing | null>(null);
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  const loading = loadedDays !== days;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ticketing?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PlatformTicketing | null) => { if (!cancelled && j) setData(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadedDays(days); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className="account-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 className="account-card__title">Ticketing</h2>
          <p className="account-card__hint">Paid events across the platform: volume, what GameShuffle earned, and payout-account health.</p>
        </div>
        <Select value={String(days)} onChange={(v) => setDays(Number(v))}
          options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
      </div>

      {loading && !data && <p className="attendees__empty">Loading…</p>}

      {data && (
        <>
          <div className="stat-row" style={{ marginTop: "var(--spacing-16)" }}>
            <StatCard label="Ticket volume" value={usdShort(data.totals.grossCents)} change={change(data.totals.grossCents, data.previous.grossCents)} changeLabel={`vs previous ${days} days`}
              sparklineData={data.series.map((p) => p.grossCents)} sparklineType="area" />
            <StatCard label="GameShuffle earned" value={usdShort(data.totals.feesCents)} change={change(data.totals.feesCents, data.previous.feesCents)} changeLabel={`vs previous ${days} days`} variant="accent"
              sparklineData={data.series.map((p) => p.feesCents)} sparklineType="area" />
            <StatCard label="Tickets" value={String(data.totals.tickets)} change={change(data.totals.tickets, data.previous.tickets)} changeLabel={`vs previous ${days} days`} />
            <StatCard label="Selling organizers" value={String(data.totals.organizers)} variant="muted" />
            <StatCard label="Refund rate" value={pct(data.totals.refundRate)} variant="muted" />
          </div>

          <Card padding="small" className="platform-ticketing__connect">
            <span className="account-card__label">Payout accounts</span>
            <p style={{ margin: "2px 0 0", fontSize: "var(--font-size-14)" }}>
              <strong>{data.connect.ready}</strong> ready · <strong>{data.connect.pending}</strong> still onboarding · {data.connect.accounts} total
            </p>
          </Card>

          <h3 style={{ margin: "var(--spacing-20) 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Volume and revenue</h3>
          <AreaChart
            data={data.series.map((p) => ({ date: day(p.date), Volume: p.grossCents / 100, Fees: p.feesCents / 100 }))}
            series={[{ dataKey: "Volume", color: "var(--primary-ink-500)" }, { dataKey: "Fees", color: "var(--accent-500)" }]}
            xAxisKey="date" height={220} showLegend valueFormatter={(v) => `$${v.toFixed(2)}`}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: "var(--spacing-20)", marginTop: "var(--spacing-20)" }}>
            <div>
              <h3 style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Top organizers</h3>
              {data.topOrganizers.length === 0 ? <p className="attendees__empty">No sales yet.</p> : data.topOrganizers.map((o) => (
                <div key={o.userId} style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-8)", padding: "var(--spacing-8) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", fontSize: "var(--font-size-12)" }}>
                  <span>{o.name}</span>
                  <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{o.tickets} · {usd(o.grossCents)} · {usd(o.feesCents)} fees</span>
                </div>
              ))}
            </div>
            <div>
              <h3 style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Top events</h3>
              {data.topEvents.length === 0 ? <p className="attendees__empty">No sales yet.</p> : data.topEvents.map((e) => (
                <div key={e.href} style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-8)", padding: "var(--spacing-8) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", fontSize: "var(--font-size-12)" }}>
                  <Link href={e.href}>{e.title}</Link>
                  <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{e.tickets} · {usd(e.grossCents)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
