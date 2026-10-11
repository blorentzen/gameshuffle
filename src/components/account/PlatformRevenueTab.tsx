"use client";

/**
 * Platform ▸ Overview ▸ Revenue (staff): what subscriptions bring in. Monthly
 * revenue from paying subscriptions (before tax and Stripe's fees), trials and
 * what they'd add, cancellations coming up, each plan, the path from account
 * to paying, and the latest subscription changes. Data from GET
 * /api/admin/revenue (src/lib/billing/revenue.ts); Stripe stays the record of
 * money actually collected.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCalendarDue, IconCash, IconHourglass, IconRefresh, IconUsers } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import type { RevenueOverview } from "@/lib/billing/revenue";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const n = (x: number) => x.toLocaleString();
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const STATUS_TONE: Record<string, "success" | "info" | "warning" | "error" | "default"> = {
  active: "success", trialing: "info", past_due: "warning", unpaid: "error", canceled: "default", incomplete: "default", incomplete_expired: "default", paused: "default",
};

export function PlatformRevenueTab() {
  const [data, setData] = useState<(RevenueOverview & { ok: boolean }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/revenue", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (j?.ok) { setData(j); setFailed(false); } else setFailed(true);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const header = (
    <AdminHeader
      title="Revenue"
      intro="What subscriptions bring in each month, before tax and Stripe's fees. Stripe has the exact money collected."
      actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} onClick={() => void load()}>Refresh</Button>}
    />
  );
  if (failed && !data) return <div className="account-card admin-screen">{header}<Alert variant="error">Couldn&apos;t load revenue. Try Refresh in a moment.</Alert></div>;
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading revenue" /></div>;

  const f = data.funnel;
  const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");

  return (
    <div className="account-card admin-screen">
      {header}

      <AdminStats label="Subscriptions">
        <StatCard label="Monthly revenue" value={usd(data.mrrCents)} source={`${usd(data.mrrCents * 12)} a year at this rate`} icon={<IconCash size={20} />} variant="accent" />
        <StatCard label="Paying subscribers" value={n(data.paying)} source={`${n(data.newPaid30d)} new in 30 days · ${n(data.churned30d)} left`} icon={<IconUsers size={20} />} />
        <StatCard label="On a trial" value={n(data.trialing)} source={data.trialing ? `${usd(data.trialMrrCents)} a month if they stay · ${n(data.trialsEndingThisWeek)} end this week` : "Nobody is trying GS Pro right now"} icon={<IconHourglass size={20} />} />
        <StatCard label="Cancelling" value={n(data.cancelling)} source="Set to end when their period runs out" icon={<IconCalendarDue size={20} />} />
      </AdminStats>

      <AdminSection title="By plan" intro={<>Prices come from <Link href="/account/platform?tab=platform-pricing">Pricing</Link>. Circuit plans only sell once Circuit billing is switched on.</>}>
        <AdminTable label="Subscriptions by plan">
          <Table variant="striped" dense>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead align="right">Paying</TableHead>
                <TableHead align="right">Monthly / yearly</TableHead>
                <TableHead align="right">On a trial</TableHead>
                <TableHead align="right">Monthly revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byPlan.map((p) => (
                <TableRow key={p.plan}>
                  <TableCell><strong>{p.label}</strong></TableCell>
                  <TableCell align="right" className="admin-num">{n(p.paying)}</TableCell>
                  <TableCell align="right" className="admin-num">{n(p.monthly)} / {n(p.annual)}</TableCell>
                  <TableCell align="right" className="admin-num">{n(p.trialing)}</TableCell>
                  <TableCell align="right" className="admin-num">{usd(p.mrrCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      </AdminSection>

      <AdminSection title="From account to paying" intro="How many accounts reach each step. Tried GS Pro counts everyone who has started a trial, even if it ended.">
        <AdminStats label="From account to paying">
          <StatCard label="Accounts" value={n(f.accounts)} source="Everyone signed up" />
          <StatCard label="Connected Twitch" value={n(f.streamers)} source={`${pct(f.streamers, f.accounts)} of accounts`} />
          <StatCard label="Tried GS Pro" value={n(f.triedPro)} source={`${pct(f.triedPro, f.streamers || f.accounts)} of ${f.streamers ? "streamers" : "accounts"}`} />
          <StatCard label="Paying" value={n(f.paying)} source={`${pct(f.paying, f.triedPro)} of those who tried`} />
        </AdminStats>
      </AdminSection>

      <AdminSection title="Latest changes" intro="The newest subscription events first: checkouts, trials, renewals, cancellations.">
        {data.recent.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconCash size={28} />} title="No subscriptions yet" description="Every checkout, trial and cancellation shows here as Stripe sends it." />
        ) : (
          <AdminTable label="Latest subscription changes">
            <Table variant="striped" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Where it stands</TableHead>
                  <TableHead>When (Pacific)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((r, i) => (
                  <TableRow key={`${r.handle ?? r.name}-${i}`}>
                    <TableCell><strong>{r.name}</strong>{r.handle && <span className="admin-table__sub">@{r.handle}</span>}</TableCell>
                    <TableCell>{r.plan}</TableCell>
                    <TableCell><Badge size="small" variant={STATUS_TONE[r.status] ?? "default"}>{r.label}</Badge></TableCell>
                    <TableCell>{when(r.at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>
    </div>
  );
}
