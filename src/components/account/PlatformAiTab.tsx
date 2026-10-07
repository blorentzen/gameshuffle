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
  Alert, Badge, BarChart, Button, Input, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCoins, IconRefresh, IconSparkles, IconUsers, IconLock } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { AiUsageOverview } from "@/lib/ai/adminUsage";

const FEATURE_COLORS: Record<string, string> = {
  pack: "var(--primary-500)",
  recap: "var(--accent-500)",
  setup: "var(--gold-500)",
  plan: "var(--success-500)",
  tournament: "var(--info-500)",
};
const PLAN_LABEL = { free: "Free", pro: "GS Pro", staff: "Staff" } as const;
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

  if (failed && !data) return <div className="account-card"><Alert variant="error" title="Couldn't load AI usage">Try Refresh, or check that ai_usage exists on this database.</Alert></div>;
  if (!data) return <div className="account-card"><LoadingLines label="Loading AI usage" /></div>;

  const t = data.totals;
  const limitsChanged = pro !== String(data.limits.proPer30d) || free !== String(data.limits.freePerDay);
  const validLimits = /^\d+$/.test(pro) && /^\d+$/.test(free);

  return (
    <div className="account-tab originals-admin ai-admin">
      <div className="originals-admin__top">
        <h2 className="account-tab__heading">AI usage</h2>
        <Button variant="secondary" size="small" iconBefore={IconRefresh} disabled={busy} onClick={() => void load()}>Refresh</Button>
      </div>
      <p className="dbot-muted">The last 30 days. Each row is one generation: who, which tool, when and the tokens it took. Prompts and outputs are never stored.</p>

      <div className="originals-admin__stats">
        <StatCard label="Generations, last 24 hours" value={n(t.day)} source={`${n(t.usersDay)} ${t.usersDay === 1 ? "account" : "accounts"}`} icon={<IconSparkles size={20} />} variant="accent" />
        <StatCard label="Last 7 days" value={n(t.week)} source={`${n(t.usersWeek)} ${t.usersWeek === 1 ? "account" : "accounts"}`} icon={<IconSparkles size={20} />} />
        <StatCard label="Last 30 days" value={n(t.month)} source={`${n(t.usersMonth)} ${t.usersMonth === 1 ? "account" : "accounts"}`} icon={<IconUsers size={20} />} />
        <StatCard label="Tokens, last 30 days" value={data.tokensRecorded ? tokens(t.inputTokens + t.outputTokens) : "Not recorded"} source={data.tokensRecorded ? `${tokens(t.inputTokens)} in · ${tokens(t.outputTokens)} out` : "Apply ai-usage-m2.sql"} icon={<IconCoins size={20} />} />
      </div>

      {(data.atLimit.free > 0 || data.atLimit.pro > 0) && (
        <Alert variant="info" title="At their limit right now">
          {data.atLimit.free > 0 && `${data.atLimit.free} free ${data.atLimit.free === 1 ? "account has" : "accounts have"} used today's tries. `}
          {data.atLimit.pro > 0 && `${data.atLimit.pro} GS Pro ${data.atLimit.pro === 1 ? "account has" : "accounts have"} used the 30-day allowance.`}
        </Alert>
      )}

      <div className="account-card">
        <h4 className="originals-admin__h4"><IconLock size={16} aria-hidden /> Limits</h4>
        <p className="dbot-muted">GS Pro counts every AI tool against one rolling 30-day allowance. Free accounts get a rolling daily allowance on AI setup, the night planner and the tournament helper; packs and recaps stay GS Pro. Staff aren&apos;t limited. Signed-out visitors are asked to make a free account first.</p>
        <form className="ai-admin__limits" onSubmit={(e) => { e.preventDefault(); if (validLimits && limitsChanged) void saveLimits(); }}>
          <Input type="number" min={0} max={10000} floatingLabel="GS Pro, per 30 days" value={pro} onChange={(e) => setPro(e.target.value)} />
          <Input type="number" min={0} max={1000} floatingLabel="Free accounts, per day" value={free} onChange={(e) => setFree(e.target.value)} />
          <Button type="submit" variant="primary" loading={saving} disabled={!validLimits || !limitsChanged}>Save limits</Button>
        </form>
        <p className="dbot-muted">Also listed as pricing levers (<Link href="/account/platform?tab=platform-pricing">Pricing</Link>), with each change in its audit log.</p>
      </div>

      <div className="account-card">
        <h4 className="originals-admin__h4">Generations per day, by tool</h4>
        <div className="ai-admin__chart">
          <BarChart
            data={data.daily}
            xAxisKey="day"
            height={220}
            stacked
            showGrid
            showLegend
            legendPosition="bottom"
            series={data.byFeature.map((f) => ({ dataKey: f.feature, name: f.label, color: FEATURE_COLORS[f.feature] ?? "var(--gray-500)", stackId: "uses" }))}
          />
        </div>
      </div>

      <div className="originals-admin__cols">
        <div className="account-card">
          <h4 className="originals-admin__h4">By tool</h4>
          <div className="originals-admin__scroll">
            <Table variant="default" dense>
              <TableHeader><TableRow><TableHead>Tool</TableHead><TableHead>24h</TableHead><TableHead>7d</TableHead><TableHead>30d</TableHead><TableHead>Accounts</TableHead><TableHead>Tokens (30d)</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.byFeature.map((f) => (
                  <TableRow key={f.feature}>
                    <TableCell><span className="ai-admin__tool">{f.label}<Badge size="small" variant={f.free ? "info" : "default"}>{f.free ? "Free to try" : "GS Pro"}</Badge></span></TableCell>
                    <TableCell>{n(f.day)}</TableCell>
                    <TableCell>{n(f.week)}</TableCell>
                    <TableCell>{n(f.month)}</TableCell>
                    <TableCell>{n(f.users)}</TableCell>
                    <TableCell>{data.tokensRecorded ? tokens(f.inputTokens + f.outputTokens) : "Not recorded"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="account-card">
          <h4 className="originals-admin__h4">By plan (30d)</h4>
          <div className="originals-admin__scroll">
            <Table variant="default" dense>
              <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Generations</TableHead><TableHead>Accounts</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.byPlan.map((p) => (
                  <TableRow key={p.plan}><TableCell>{PLAN_LABEL[p.plan]}</TableCell><TableCell>{n(p.uses)}</TableCell><TableCell>{n(p.users)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="account-card">
        <h4 className="originals-admin__h4">Who uses it most (30d)</h4>
        {data.topUsers.length === 0 ? <p className="dbot-muted">Nobody has used an AI tool in the last 30 days.</p> : (
          <div className="originals-admin__scroll">
            <Table variant="default" dense>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Plan</TableHead><TableHead>Generations</TableHead><TableHead>Last used</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.topUsers.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell><span className="ai-admin__who"><strong>{u.name}</strong>{u.handle && <span className="dbot-muted">@{u.handle}</span>}</span></TableCell>
                    <TableCell><span className="ai-admin__tool">{PLAN_LABEL[u.plan]}{u.atLimit && <Badge size="small" variant="warning">At limit</Badge>}</span></TableCell>
                    <TableCell>{n(u.uses)}</TableCell>
                    <TableCell>{when(u.lastUsed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
