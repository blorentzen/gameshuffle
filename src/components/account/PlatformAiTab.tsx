"use client";

/**
 * Platform ▸ AI usage (staff/admin): how much the AI features get used over
 * the last 30 days, by feature and by plan, who uses them most, the tokens
 * they cost, and the two allowance limits (GS Pro per 30 days, free accounts
 * per day), editable here. Data from GET /api/admin/ai; no prompts or outputs
 * are ever stored, so none are shown.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, BarChart, Button, EmptyState, Input, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCoins, IconCrown, IconRefresh, IconShieldCheck, IconSparkles, IconUser, IconUsers } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { AiUsageOverview } from "@/lib/ai/adminUsage";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";

const FEATURE_COLORS: Record<string, string> = {
  pack: "var(--primary-500)",
  recap: "var(--accent-500)",
  setup: "var(--gold-500)",
  plan: "var(--success-500)",
  tournament: "var(--warning-500)",
};
const PLAN_LABEL = { free: "Free", pro: "GS Pro", staff: "Staff" } as const;
const PLAN_ICON = { free: IconUser, pro: IconCrown, staff: IconShieldCheck } as const;
const n = (x: number) => x.toLocaleString();
const tokens = (x: number) => (x >= 1_000_000 ? `${(x / 1_000_000).toFixed(1)}M` : x >= 10_000 ? `${Math.round(x / 1000)}k` : n(x));
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PlatformAiTab() {
  const toast = useToast();
  const [data, setData] = useState<(AiUsageOverview & { ok: boolean }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pro, setPro] = useState("");
  const [free, setFree] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/ai", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (j?.ok) {
        setData(j);
        setFailed(false);
        setPro(String(j.limits.proPer30d));
        setFree(String(j.limits.freePerDay));
      } else setFailed(true);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveLimits = async () => {
    setSaving(true);
    const r = await fetch("/api/admin/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proPer30d: Number(pro), freePerDay: Number(free) }) }).catch(() => null);
    setSaving(false);
    if (!r?.ok) { toast.error("Couldn't save the limits. Use whole numbers (0 turns a plan off)."); return; }
    toast.success("AI limits saved");
    void load();
  };

  const header = (
    <AdminHeader
      title="AI usage"
      intro="The last 30 days. Each generation records who, which tool, when and the tokens it took. Prompts and outputs are never stored."
      actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} onClick={() => void load()}>Refresh</Button>}
    />
  );
  if (failed && !data) return <div className="account-card admin-screen">{header}<Alert variant="error">Couldn&apos;t load AI usage. Try Refresh in a moment.</Alert></div>;
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading AI usage" /></div>;

  const t = data.totals;
  const limitsChanged = pro !== String(data.limits.proPer30d) || free !== String(data.limits.freePerDay);
  const validLimits = /^\d+$/.test(pro) && /^\d+$/.test(free);
  const accounts = (k: number) => `${n(k)} ${k === 1 ? "account" : "accounts"}`;

  return (
    <div className="account-card admin-screen ai-admin">
      {header}

      <AdminStats label="AI generations">
        <StatCard label="Last 24 hours" value={n(t.day)} source={accounts(t.usersDay)} icon={<IconSparkles size={20} />} variant="accent" />
        <StatCard label="Last 7 days" value={n(t.week)} source={accounts(t.usersWeek)} icon={<IconSparkles size={20} />} />
        <StatCard label="Last 30 days" value={n(t.month)} source={accounts(t.usersMonth)} icon={<IconUsers size={20} />} />
        <StatCard label="Tokens, 30 days" value={data.tokensRecorded ? tokens(t.inputTokens + t.outputTokens) : "Not recorded"} source={data.tokensRecorded ? `${tokens(t.inputTokens)} in · ${tokens(t.outputTokens)} out` : "This database doesn't record tokens yet"} icon={<IconCoins size={20} />} />
      </AdminStats>

      {(data.atLimit.free > 0 || data.atLimit.pro > 0) && (
        <Alert variant="info" title="At their limit right now">
          {data.atLimit.free > 0 && `${data.atLimit.free} free ${data.atLimit.free === 1 ? "account has" : "accounts have"} used today's tries. `}
          {data.atLimit.pro > 0 && `${data.atLimit.pro} GS Pro ${data.atLimit.pro === 1 ? "account has" : "accounts have"} used the 30-day allowance.`}
        </Alert>
      )}

      <AdminSection title="Generations per day, by tool">
        <div className="admin-chart ai-admin__chart" role="region" aria-label="Generations per day, by tool (scrolls sideways)" tabIndex={0}>
          <BarChart
            data={data.daily}
            xAxisKey="day"
            height={220}
            showXAxis
            showYAxis
            stacked
            showGrid
            showLegend
            legendPosition="bottom"
            series={data.byFeature.map((f) => ({ dataKey: f.feature, name: f.label, color: FEATURE_COLORS[f.feature] ?? "var(--gray-500)", stackId: "uses" }))}
          />
        </div>
      </AdminSection>

      <AdminSection title="By tool">
        <AdminTable label="Generations by tool">
          <Table variant="striped" dense>
            <TableHeader><TableRow><TableHead>Tool</TableHead><TableHead align="right">24h</TableHead><TableHead align="right">7 days</TableHead><TableHead align="right">30 days</TableHead><TableHead align="right">Accounts</TableHead><TableHead align="right">Tokens, 30 days</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.byFeature.map((f) => (
                <TableRow key={f.feature}>
                  <TableCell><span className="ai-admin__tool">{f.label}<Badge size="small" variant={f.free ? "info" : "default"}>{f.free ? "Free to try" : "GS Pro"}</Badge></span></TableCell>
                  <TableCell align="right" className="admin-num">{n(f.day)}</TableCell>
                  <TableCell align="right" className="admin-num">{n(f.week)}</TableCell>
                  <TableCell align="right" className="admin-num">{n(f.month)}</TableCell>
                  <TableCell align="right" className="admin-num">{n(f.users)}</TableCell>
                  <TableCell align="right" className="admin-num">{data.tokensRecorded ? tokens(f.inputTokens + f.outputTokens) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      </AdminSection>

      <AdminSection title="By plan, 30 days">
        <AdminStats label="Generations by plan" columns={3}>
          {(Object.keys(PLAN_LABEL) as (keyof typeof PLAN_LABEL)[]).map((plan) => {
            const row = data.byPlan.find((p) => p.plan === plan);
            const Icon = PLAN_ICON[plan];
            return <StatCard key={plan} label={PLAN_LABEL[plan]} value={n(row?.uses ?? 0)} source={accounts(row?.users ?? 0)} icon={<Icon size={20} />} />;
          })}
        </AdminStats>
      </AdminSection>

      <AdminSection title="Who uses it most, 30 days">
        {data.topUsers.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconSparkles size={28} />} title="No one has used an AI tool in the last 30 days" description="Accounts show here, busiest first, once they do." />
        ) : (
          <AdminTable label="Accounts that use AI the most">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Plan</TableHead><TableHead align="right">Generations</TableHead><TableHead>Last used</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.topUsers.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell><strong>{u.name}</strong>{u.handle && <span className="admin-table__sub">@{u.handle}</span>}</TableCell>
                    <TableCell><span className="ai-admin__tool">{PLAN_LABEL[u.plan]}{u.atLimit && <Badge size="small" variant="warning">At limit</Badge>}</span></TableCell>
                    <TableCell align="right" className="admin-num">{n(u.uses)}</TableCell>
                    <TableCell>{when(u.lastUsed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>

      <AdminSection
        title="Limits"
        intro={<>GS Pro counts every AI tool against one rolling 30-day allowance. Free accounts get a daily allowance (reset at midnight Pacific) on AI setup, the night planner and the tournament helper; packs and recaps stay GS Pro. Staff aren&apos;t limited, and signed-out visitors are asked to make a free account first. Also listed on <Link href="/account/platform?tab=platform-pricing">Pricing</Link>, where each change is logged.</>}
      >
        <form className="ai-admin__limits" onSubmit={(e) => { e.preventDefault(); if (validLimits && limitsChanged) void saveLimits(); }}>
          <Input type="number" min={0} max={10000} floatingLabel="GS Pro, per 30 days" value={pro} onChange={(e) => setPro(e.target.value)} />
          <Input type="number" min={0} max={1000} floatingLabel="Free accounts, per day" value={free} onChange={(e) => setFree(e.target.value)} />
          <Button type="submit" variant="primary" loading={saving} disabled={!validLimits || !limitsChanged}>Save limits</Button>
        </form>
      </AdminSection>
    </div>
  );
}
