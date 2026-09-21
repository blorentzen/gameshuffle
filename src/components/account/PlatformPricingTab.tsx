"use client";

/**
 * PlatformPricingTab — staff/admin editor for the pricing lever model.
 *
 * Three panels over one source of truth (`gs_pricing_*`):
 *   Plans & prices — what each plan sells for. Changing an amount creates a NEW
 *                    Stripe Price, moves the lookup key to it and archives the
 *                    old one. Existing subscribers stay where they are.
 *   Levers          — platform fee per plan, SMS allowances, processing
 *                    estimate, hold/refund windows. Read on every checkout.
 *   Sync            — backfill Stripe ids by lookup key, surface amount drift
 *                    and prices Stripe has that we don't know about.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Input, Modal } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { Lever, PricingPlan, PricingPrice } from "@/lib/pricing/catalog";

interface Payload {
  plans: PricingPlan[];
  prices: PricingPrice[];
  levers: Lever[];
  audit: { id: number; actor_id: string | null; action: string; target: string; before: unknown; after: unknown; created_at: string }[];
  livemode: boolean;
}

const LEVER_GROUPS: { title: string; match: (k: string) => boolean; helper: string }[] = [
  { title: "Platform fee on paid tickets", match: (k) => k.startsWith("platform_fee_") || k === "connect_min_fee_cents" || k === "fee_payer_default", helper: "Basis points (500 = 5%) plus a fixed amount per ticket, per organizer plan. Computed at purchase and frozen on the order." },
  { title: "Processing estimate shown to buyers", match: (k) => k.startsWith("processing_fee_"), helper: "Stripe's card rate. Display only; Stripe charges the real amount." },
  { title: "SMS", match: (k) => k.startsWith("sms_"), helper: "Monthly segment allowance per plan; 0 turns SMS off for that plan. Organizer-only, US numbers only at launch." },
  { title: "Limits and windows", match: () => true, helper: "Everything else: Free tournament cap, seat hold, default refund window." },
];

const fmtUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const INTERVAL_LABEL: Record<string, string> = { month: "monthly", year: "annual", once: "one-time" };

export function PlatformPricingTab() {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ price: PricingPrice; plan: PricingPlan; value: string } | null>(null);
  const [leverDrafts, setLeverDrafts] = useState<Record<string, string>>({});
  const [sync, setSync] = useState<{ backfilled: string[]; amountDrift: { lookupKey: string; table: number; stripe: number }[]; unmapped: { id: string; lookupKey: string | null; amount: number | null; product: string | null }[] } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/pricing", { cache: "no-store" });
    if (!r.ok) { setError(`Couldn't load pricing (${r.status})`); return; }
    setData((await r.json()) as Payload);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error((j.error as string) ?? `HTTP ${r.status}`);
    return j;
  };

  const savePrice = async () => {
    if (!priceEdit) return;
    const cents = Math.round(Number(priceEdit.value) * 100);
    if (!Number.isFinite(cents) || cents < 0) { toast.error("Enter a valid amount"); return; }
    setBusy("price");
    try {
      await post({ action: "price.change", planId: priceEdit.plan.id, interval: priceEdit.price.interval, amountCents: cents });
      toast.success(`${priceEdit.plan.name} ${INTERVAL_LABEL[priceEdit.price.interval]} is now ${fmtUsd(cents)}. Existing subscribers keep their price.`);
      setPriceEdit(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change price"); } finally { setBusy(null); }
  };

  const saveLever = async (l: Lever) => {
    const draft = leverDrafts[l.key];
    if (draft === undefined) return;
    setBusy(l.key);
    try {
      const isText = l.valueText != null && l.valueNum == null;
      await post(isText ? { action: "lever.set", key: l.key, valueText: draft } : { action: "lever.set", key: l.key, valueNum: draft === "" ? null : Number(draft) });
      toast.success(`Saved ${l.key}`);
      setLeverDrafts((d) => { const n = { ...d }; delete n[l.key]; return n; });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(null); }
  };

  const runSync = async () => {
    setBusy("sync");
    try {
      const r = (await post({ action: "sync.stripe" })) as unknown as NonNullable<typeof sync>;
      setSync(r);
      toast.success(`Synced: ${r.backfilled.length} ids backfilled, ${r.amountDrift.length} drift, ${r.unmapped.length} unmapped`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); } finally { setBusy(null); }
  };

  const pricesByPlan = useMemo(() => {
    const m = new Map<string, PricingPrice[]>();
    for (const p of data?.prices ?? []) if (p.active && !p.supersededBy) m.set(p.planId, [...(m.get(p.planId) ?? []), p]);
    return m;
  }, [data]);

  if (error) return <div className="account-card"><Alert variant="error">{error}</Alert></div>;
  if (!data) return <div className="account-card"><p className="account-tab__empty">Loading…</p></div>;

  return (
    <div className="account-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--spacing-16)", flexWrap: "wrap" }}>
        <div>
          <h2 className="account-tab__heading">Pricing</h2>
          <p className="account-tab__intro">
            Plans, prices and fee levers as data. Prices resolve to Stripe by <code>lookup_key</code>; changing one here creates a new Stripe Price and archives the old. Subscribers on an old price stay there until migrated.
          </p>
        </div>
        <Badge variant={data.livemode ? "warning" : "info"}>{data.livemode ? "Stripe LIVE" : "Stripe test mode"}</Badge>
      </div>

      {/* ── Plans & prices ─────────────────────────────────────────────── */}
      <h3 className="account-tab__subheading" style={{ marginTop: "var(--spacing-24)" }}>Plans &amp; prices</h3>
      <div style={{ display: "grid", gap: "var(--spacing-12)" }}>
        {data.plans.map((plan) => (
          <Card key={plan.id} padding="medium">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{plan.name}</strong>
                  <Badge variant="outline" size="small">{plan.line} · {plan.kind}</Badge>
                  {!plan.active && <Badge variant="warning" size="small">inactive</Badge>}
                  {plan.stripeProductId ? <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{plan.stripeProductId}</span> : plan.kind !== "tier" && <span style={{ fontSize: "var(--font-size-12)", color: "var(--warning-700)" }}>no Stripe product linked yet</span>}
                </div>
                {plan.blurb && <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-13, 13px)", color: "var(--text-secondary)" }}>{plan.blurb}</p>}
                <p style={{ margin: "var(--spacing-8) 0 0", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                  {plan.capabilities.length} capabilities · limits {JSON.stringify(plan.limits)}
                </p>
              </div>
              <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
                {(pricesByPlan.get(plan.id) ?? []).map((pr) => (
                  <button key={pr.id} type="button" className="pricing-price" onClick={() => setPriceEdit({ price: pr, plan, value: (pr.amountCents / 100).toFixed(2) })} title={pr.stripePriceId ?? "not yet resolved in Stripe"}>
                    <span className="pricing-price__amount">{fmtUsd(pr.amountCents)}</span>
                    <span className="pricing-price__meta">{INTERVAL_LABEL[pr.interval]} · {pr.lookupKey}{pr.stripePriceId ? "" : " · unresolved"}</span>
                  </button>
                ))}
                {plan.kind === "tier" && <span style={{ fontSize: "var(--font-size-13, 13px)", color: "var(--text-tertiary)", alignSelf: "center" }}>free</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Levers ─────────────────────────────────────────────────────── */}
      <h3 className="account-tab__subheading" style={{ marginTop: "var(--spacing-32)" }}>Levers</h3>
      {(() => {
        const used = new Set<string>();
        return LEVER_GROUPS.map((g) => {
          const rows = data.levers.filter((l) => !used.has(l.key) && g.match(l.key));
          rows.forEach((l) => used.add(l.key));
          if (rows.length === 0) return null;
          return (
            <div key={g.title} style={{ marginBottom: "var(--spacing-20)" }}>
              <h4 style={{ margin: "0 0 var(--spacing-4)", fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-bold)" }}>{g.title}</h4>
              <p style={{ margin: "0 0 var(--spacing-12)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{g.helper}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "var(--spacing-12)" }}>
                {rows.map((l) => {
                  const isText = l.valueText != null && l.valueNum == null;
                  const current = isText ? (l.valueText ?? "") : String(l.valueNum ?? "");
                  const draft = leverDrafts[l.key] ?? current;
                  const dirty = draft !== current;
                  return (
                    <Card key={l.key} padding="small">
                      <label style={{ display: "block" }}>
                        <span style={{ display: "block", fontSize: "var(--font-size-12)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: "var(--spacing-4)" }}>{l.key}</span>
                        <Input type={isText ? "text" : "number"} value={draft} onChange={(e) => setLeverDrafts((d) => ({ ...d, [l.key]: e.target.value }))} fullWidth />
                      </label>
                      {l.description && <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{l.description}</p>}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--spacing-8)" }}>
                        <Button size="small" variant="primary" disabled={!dirty || busy === l.key} onClick={() => void saveLever(l)}>Save</Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        });
      })()}

      {/* ── Sync ───────────────────────────────────────────────────────── */}
      <h3 className="account-tab__subheading" style={{ marginTop: "var(--spacing-32)" }}>Stripe sync</h3>
      <p className="account-tab__intro">Backfills Stripe price ids by lookup key for this environment, reports amounts that differ between the table and Stripe, and lists active Stripe prices we don&apos;t map. Webhooks keep this current between runs.</p>
      <Button variant="secondary" onClick={() => void runSync()} disabled={busy === "sync"}>{busy === "sync" ? "Syncing…" : "Sync from Stripe"}</Button>
      {sync && (
        <div style={{ marginTop: "var(--spacing-12)", fontSize: "var(--font-size-13, 13px)" }}>
          <p style={{ margin: 0 }}>Backfilled: {sync.backfilled.length ? sync.backfilled.join(", ") : "none"}</p>
          {sync.amountDrift.length > 0 && <Alert variant="warning" title="Amount drift">{sync.amountDrift.map((d) => `${d.lookupKey}: table ${fmtUsd(d.table)} vs Stripe ${fmtUsd(d.stripe)}`).join(" · ")}</Alert>}
          {sync.unmapped.length > 0 && <p style={{ margin: "var(--spacing-8) 0 0", color: "var(--text-secondary)" }}>Unmapped in Stripe: {sync.unmapped.map((u) => `${u.product ?? "?"} ${u.lookupKey ?? u.id} ${u.amount != null ? fmtUsd(u.amount) : ""}`).join(" · ")}</p>}
        </div>
      )}

      {/* ── Audit ──────────────────────────────────────────────────────── */}
      {data.audit.length > 0 && (
        <>
          <h3 className="account-tab__subheading" style={{ marginTop: "var(--spacing-32)" }}>Recent changes</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "var(--font-size-13, 13px)", color: "var(--text-secondary)" }}>
            {data.audit.map((a) => (
              <li key={a.id} style={{ padding: "var(--spacing-6, 0.4rem) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))" }}>
                <code>{a.action}</code> {a.target} · {new Date(a.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal isOpen={!!priceEdit} onClose={() => setPriceEdit(null)} title={priceEdit ? `Change ${priceEdit.plan.name} (${INTERVAL_LABEL[priceEdit.price.interval]})` : ""} size="small"
        primaryAction={{ label: busy === "price" ? "Saving…" : "Create new price", onClick: () => { if (busy !== "price") void savePrice(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setPriceEdit(null) }}>
        {priceEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
            <Input type="number" step="0.01" min="0" value={priceEdit.value} onChange={(e) => setPriceEdit({ ...priceEdit, value: e.target.value })} fullWidth />
            <p style={{ margin: 0, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
              Creates a new Stripe Price on the same product and moves <code>{priceEdit.price.lookupKey}</code> to it; the current price ({fmtUsd(priceEdit.price.amountCents)}) is archived. New checkouts use the new amount immediately. Existing subscribers are not changed.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
