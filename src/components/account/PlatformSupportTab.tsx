"use client";

/**
 * Platform admin ▸ Money ▸ Support (staff/admin): Support GameShuffle
 * (src/lib/support/store.ts, /api/admin/support). This month's support against
 * the goal, the goal and its cost lines as the /support page shows them
 * (autosaved; a goal of $0 hides the bar), and recent payments with the
 * supporters wall controls. Refunds happen in the Stripe Dashboard; a full
 * refund marks the payment refunded here on its own.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, Input, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconHeart, IconTarget, IconUsers } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminRowMenu, AdminSection, AdminStats, AdminTable, SaveStatus } from "@/components/account/admin/AdminKit";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { dollars, goalPercent, type SupportCost } from "@/lib/support/rules";
import type { AdminGift } from "@/lib/support/store";

interface Data { ready: boolean; settings?: { goalCents: number; costs: SupportCost[] }; month?: { raisedCents: number; supporters: number } | null; gifts?: AdminGift[] }
interface Draft { goal: string; costs: { label: string; amount: string }[] }

const toCents = (s: string) => Math.max(0, Math.round((Number(s.replace(/[$,\s]/g, "")) || 0) * 100));
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

export function PlatformSupportTab() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/support").catch(() => null);
    const d = res?.ok ? ((await res.json()) as Data) : { ready: false };
    setData(d);
    if (d.settings) setDraft({ goal: d.settings.goalCents ? String(d.settings.goalCents / 100) : "", costs: d.settings.costs.map((c) => ({ label: c.label, amount: String(c.cents / 100) })) });
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const { status } = useAutosave(draft, async (d) => {
    if (!d) return false;
    const res = await fetch("/api/admin/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", goalCents: toCents(d.goal), costs: d.costs.map((c) => ({ label: c.label, cents: toCents(c.amount) })) }) }).catch(() => null);
    return !!res?.ok;
  }, { ready: !!draft });

  const hide = async (g: AdminGift, hidden: boolean) => {
    const res = await fetch("/api/admin/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hide", id: g.id, hidden }) }).catch(() => null);
    if (res?.ok) { toast.success(hidden ? "Taken off the wall" : "Back on the wall"); void load(); }
    else toast.error("Couldn't change that. Try again.");
  };

  if (!data) return <div className="account-card admin-screen"><LoadingLines label="Loading support" /></div>;
  if (!data.ready || !draft) {
    return (
      <div className="account-card admin-screen">
        <AdminHeader title="Support" intro="One-time and monthly support for GameShuffle." />
        <Alert variant="info" title="Not set up on this database yet">Run supabase/support-m1.sql, then come back to set the monthly goal.</Alert>
      </div>
    );
  }
  const goalCents = toCents(draft.goal);
  const raised = data.month?.raisedCents ?? 0;
  const gifts = data.gifts ?? [];

  return (
    <div className="account-card admin-screen">
      <AdminHeader title="Support" intro={<>One-time and monthly support from players, shown on <a href="/support" target="_blank" rel="noopener">the support page</a>. Never tokens, never a plan.</>} actions={<SaveStatus status={status} />} />
      <AdminStats columns={3} label="This month">
        <StatCard label="Support this month" value={dollars(raised)} source="Pacific month, refunds taken off" icon={<IconHeart size={20} />} variant="accent" />
        <StatCard label="Supporters this month" value={String(data.month?.supporters ?? 0)} icon={<IconUsers size={20} />} />
        <StatCard label="Of the goal" value={goalCents ? `${goalPercent(raised, goalCents)}%` : "No goal"} source={goalCents ? `Goal ${dollars(goalCents)}` : "Set one below to show the bar"} icon={<IconTarget size={20} />} />
      </AdminStats>

      <AdminSection title="The monthly goal" intro="What the support page shows: the goal bar fills from real support. A goal of $0 hides the bar. The cost lines are what support pays for; leave them empty to show a general list.">
        <div className="support-admin__goal">
          <Input value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder="Goal in dollars, e.g. 300" aria-label="Monthly goal in dollars" inputMode="decimal" />
        </div>
        <div className="support-admin__costs">
          {draft.costs.map((c, i) => (
            <div key={i} className="support-admin__cost">
              <Input value={c.label} onChange={(e) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="What it pays for" aria-label={`Cost line ${i + 1}`} maxLength={60} />
              <Input value={c.amount} onChange={(e) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} placeholder="Dollars" aria-label={`Cost line ${i + 1} amount in dollars`} inputMode="decimal" />
              <Button variant="ghost" size="small" onClick={() => setDraft({ ...draft, costs: draft.costs.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
          ))}
          {draft.costs.length < 12 && <div><Button variant="secondary" size="small" onClick={() => setDraft({ ...draft, costs: [...draft.costs, { label: "", amount: "" }] })}>Add a cost line</Button></div>}
        </div>
      </AdminSection>

      <AdminSection title="Recent support" intro="Refunds happen in the Stripe Dashboard and show here on their own. Take a name or note off the wall if it shouldn't be there.">
        {!gifts.length ? <EmptyState title="No support yet" description="Payments show here as they come in." /> : (
          <AdminTable label="Recent support">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Wall</TableHead><TableHead>Note</TableHead><TableHead><span className="sr-only">More</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {gifts.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{when(g.paidAt)}</TableCell>
                    <TableCell>
                      <strong>{dollars(g.cents)}</strong>{" "}
                      {g.kind === "monthly" && <Badge variant="info" size="small">Monthly</Badge>}{" "}
                      {g.status === "refunded" && <Badge variant="warning" size="small">Refunded</Badge>}
                    </TableCell>
                    <TableCell>{g.onWall && g.name ? (g.hidden ? <span className="dbot-muted">{g.name} (hidden)</span> : g.name) : <span className="dbot-muted">{g.account ? "Account, off the wall" : "Off the wall"}</span>}</TableCell>
                    <TableCell>{g.note ?? ""}</TableCell>
                    <TableCell>
                      {g.onWall && g.name && <AdminRowMenu label={`More for ${g.name}`} items={[{ label: g.hidden ? "Put back on the wall" : "Take off the wall", onClick: () => void hide(g, !g.hidden) }]} />}
                    </TableCell>
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
