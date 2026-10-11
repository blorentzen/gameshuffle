"use client";

/**
 * Platform ▸ Pricing (staff/admin): the pricing lever model, one source of
 * truth (`gs_pricing_*`) shown in plain words.
 *
 *   Plans and prices  what each plan sells for and includes. Changing an
 *                     amount creates a NEW Stripe Price, moves the lookup key
 *                     to it and archives the old one. Subscribers stay put.
 *   Fees and limits   platform fee per plan, card processing estimate, SMS
 *                     allowances, AI allowances, hold/refund windows. Read on
 *                     every checkout. Edited in a modal in natural units
 *                     (percent, dollars), stored as basis points and cents.
 *   Check Stripe      backfill Stripe ids by lookup key, surface amount drift
 *                     and prices Stripe has that we don't know about.
 *   Recent changes    the pricing audit log, labelled.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Input, Modal, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCreditCard, IconHistory, IconMessage, IconPencil, IconRefresh, IconSparkles, IconTicket, IconAdjustments } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { Lever, PricingPlan, PricingPrice } from "@/lib/pricing/catalog";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminPanel, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";

interface AuditRow { id: number; actor_id: string | null; action: string; target: string; before: unknown; after: unknown; created_at: string }

interface Payload {
  plans: PricingPlan[];
  prices: PricingPrice[];
  levers: Lever[];
  audit: AuditRow[];
  /** Account id → name, for who made each change. */
  names?: Record<string, string>;
  livemode: boolean;
}

interface SyncResult {
  backfilled: string[];
  amountDrift: { lookupKey: string; table: number; stripe: number }[];
  unmapped: { id: string; lookupKey: string | null; amount: number | null; product: string | null }[];
}

// ── Wording ──────────────────────────────────────────────────────────────────

const fmtUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const n = (x: number) => x.toLocaleString("en-US");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

const INTERVAL: Record<string, { adj: string; per: string }> = {
  month: { adj: "monthly", per: "a month" },
  year: { adj: "yearly", per: "a year" },
  once: { adj: "one-time", per: "one time" },
};
const INTERVAL_ORDER = ["month", "year", "once"];
const intervalOf = (i: string) => INTERVAL[i] ?? { adj: i, per: i };

const KIND_LABEL: Record<PricingPlan["kind"], string> = { tier: "Free plan", subscription: "Subscription", addon: "Add-on", pass: "Event pass" };
const LINE_LABEL: Record<PricingPlan["line"], string> = { core: "Everyone", pro: "Streamers", circuit: "Organizers" };

/** Plan limits (jsonb) in words. Unknown keys fall back to a readable key. */
const LIMIT_LABEL: Record<string, string> = {
  tournaments_active: "Tournaments at once",
  tournament_player_cap: "Players per tournament",
  saved_configs: "Saved setups",
  sms_segments: "Text message segments a month",
};
const limitOrder = (key: string) => { const i = Object.keys(LIMIT_LABEL).indexOf(key); return i === -1 ? 99 : i; };
const humanize = (key: string) => {
  const s = key.replace(/[._]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
function limitValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "Unlimited";
  if (v === "lobby") return "The game's lobby size";
  if (v === "override") return "Set for each event";
  if (typeof v === "number") {
    if (key === "sms_segments" && v === 0) return "None";
    if (key === "tournament_player_cap") return `Up to ${n(v)}`;
    return n(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

type Unit = "percent" | "money" | "count" | "minutes" | "days" | "segments" | "uses" | "payer" | "text";
interface LeverMeta { label: string; help: string; unit: Unit }

/** Single settings, in words. Per-plan fees and SMS allowances are matched by prefix below. */
const LEVER_META: Record<string, LeverMeta> = {
  connect_min_fee_cents: { label: "Smallest fee per order", help: "A floor on our fee for each paid order. 0 means no floor.", unit: "money" },
  fee_payer_default: { label: "Who pays the fees on a new event", help: "Who covers our fee and card processing by default. Organizers can change it for each event.", unit: "payer" },
  sms_overage_cents: { label: "Price per extra text segment", help: "Charged for each segment past the monthly allowance, on Circuit 256 only. Other plans stop at their allowance.", unit: "money" },
  sms_regions: { label: "Countries texts can go to", help: "Two-letter country codes separated by commas, like US,CA. US numbers only at launch.", unit: "text" },
  free_tournaments_active: { label: "Tournaments a free account can run at once", help: "Free organizers can have this many tournaments open at the same time.", unit: "count" },
  ticket_hold_minutes: { label: "Seat hold at checkout", help: "How long checkout holds a seat before letting it go. Stripe needs at least 30 minutes.", unit: "minutes" },
  refund_window_days_default: { label: "Refund window", help: "How many days before an event attendees can still refund themselves, unless the organizer sets their own.", unit: "days" },
  ai_pro_per_30d: { label: "GS Pro, per 30 days", help: "Every AI tool counts against one rolling 30-day allowance. Staff aren't limited.", unit: "uses" },
  ai_free_per_day: { label: "Free accounts, per day", help: "On the free-to-try AI tools. Resets at midnight Pacific. 0 turns them off for free accounts.", unit: "uses" },
};

const FEE_PCT = "platform_fee_bps.";
const FEE_FIXED = "platform_fee_fixed_cents.";
const SMS_PLAN = "sms_segments.";
const PROC_PCT = "processing_fee_bps";
const PROC_FIXED = "processing_fee_fixed_cents";
const LIMIT_KEYS = ["free_tournaments_active", "ticket_hold_minutes", "refund_window_days_default"];
const AI_KEYS = ["ai_pro_per_30d", "ai_free_per_day"];
const FEE_KEYS = ["connect_min_fee_cents", "fee_payer_default"];
const SMS_KEYS = ["sms_overage_cents", "sms_regions"];

const isTextLever = (l: Lever) => l.valueText != null && l.valueNum == null;

function display(l: Lever | undefined, unit: Unit): string {
  if (!l) return "Not set";
  if (unit === "text" || unit === "payer" || isTextLever(l)) {
    const t = l.valueText ?? "";
    if (unit === "payer") return t === "organizer" ? "Organizer" : t === "buyer" ? "Buyer" : t || "Not set";
    return t || "Not set";
  }
  const v = l.valueNum;
  if (v == null) return "Not set";
  switch (unit) {
    case "percent": return `${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
    case "money": return fmtUsd(v);
    case "minutes": return `${n(v)} ${v === 1 ? "minute" : "minutes"}`;
    case "days": return `${n(v)} ${v === 1 ? "day" : "days"}`;
    case "segments": return v === 0 ? "Off" : `${n(v)} a month`;
    default: return n(v);
  }
}

/** Natural-unit input value for a lever. */
function draftOf(l: Lever, unit: Unit): string {
  if (unit === "text" || unit === "payer" || isTextLever(l)) return l.valueText ?? "";
  if (l.valueNum == null) return "";
  if (unit === "money") return (l.valueNum / 100).toFixed(2);
  if (unit === "percent") return String(l.valueNum / 100);
  return String(l.valueNum);
}

/** Draft back to what the API stores; null when the draft isn't valid. */
function toStored(draft: string, unit: Unit): { valueNum?: number; valueText?: string } | null {
  if (unit === "text" || unit === "payer") return draft.trim() ? { valueText: draft.trim() } : null;
  const x = Number(draft);
  if (draft.trim() === "" || !Number.isFinite(x) || x < 0) return null;
  if (unit === "percent" || unit === "money") return { valueNum: Math.round(x * 100) };
  if (!Number.isInteger(x)) return null;
  return { valueNum: x };
}

/** What the number in a field is counted in (shown in brackets after its label). */
const UNIT_FIELD: Record<Unit, string> = {
  percent: "%", money: "US dollars", count: "", minutes: "minutes", days: "days", segments: "segments a month", uses: "AI uses", payer: "", text: "",
};

/** API errors: sentences (from Stripe) pass through; bare codes get a plain line. */
const friendly = (e: unknown) => {
  const m = e instanceof Error ? e.message : "";
  return m && /\s/.test(m) ? m.replace(/[.\s]+$/, "") : "the server didn't accept it. Check the value and try again";
};

interface EditField { lever: Lever; label: string; unit: Unit }
interface EditState { title: string; help: string; fields: EditField[]; drafts: string[] }

// ── Screen ───────────────────────────────────────────────────────────────────

export function PlatformPricingTab() {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ price: PricingPrice; plan: PricingPlan; value: string } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/pricing", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) { setError("Couldn't load pricing. Refresh the page in a moment."); return; }
    setError(null);
    setData((await r.json()) as Payload);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error((j.error as string) ?? `HTTP ${r.status}`);
    return j;
  };

  const savePrice = async () => {
    if (!priceEdit) return;
    const cents = Math.round(Number(priceEdit.value) * 100);
    if (priceEdit.value.trim() === "" || !Number.isFinite(cents) || cents < 0) { toast.error("Enter a price in dollars, like 9.00"); return; }
    setBusy("price");
    try {
      await post({ action: "price.change", planId: priceEdit.plan.id, interval: priceEdit.price.interval, amountCents: cents });
      toast.success(`${priceEdit.plan.name} ${intervalOf(priceEdit.price.interval).adj} is now ${fmtUsd(cents)}. People already subscribed keep their price.`);
      setPriceEdit(null); await load();
    } catch (e) { toast.error(`Couldn't change the price: ${friendly(e)}.`); } finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const changes: { key: string; body: Record<string, unknown> }[] = [];
    for (let i = 0; i < edit.fields.length; i++) {
      const f = edit.fields[i];
      const stored = toStored(edit.drafts[i], f.unit);
      if (!stored) { toast.error(`Check "${f.label}": ${f.unit === "text" || f.unit === "payer" ? "it can't be empty" : f.unit === "percent" || f.unit === "money" ? "use a number like 2.5" : "use a whole number, 0 or more"}.`); return; }
      const same = stored.valueText !== undefined ? stored.valueText === (f.lever.valueText ?? "") : stored.valueNum === f.lever.valueNum;
      if (!same) changes.push({ key: f.lever.key, body: stored.valueText !== undefined ? { action: "lever.set", key: f.lever.key, valueText: stored.valueText } : { action: "lever.set", key: f.lever.key, valueNum: stored.valueNum } });
    }
    if (changes.length === 0) { setEdit(null); return; }
    setBusy("lever");
    try {
      for (const c of changes) await post(c.body);
      toast.success(`${edit.title}: saved`);
      setEdit(null);
      await load();
    } catch (e) { toast.error(`Couldn't save: ${friendly(e)}.`); } finally { setBusy(null); }
  };

  const runSync = async () => {
    setBusy("sync");
    try {
      const r = (await post({ action: "sync.stripe" })) as unknown as SyncResult;
      setSync(r);
      toast.success(`Checked Stripe: ${r.backfilled.length} linked, ${r.amountDrift.length} amounts differ, ${r.unmapped.length} unknown`);
      await load();
    } catch (e) { toast.error(`Couldn't check Stripe: ${friendly(e)}.`); } finally { setBusy(null); }
  };

  const pricesByPlan = useMemo(() => {
    const m = new Map<string, PricingPrice[]>();
    for (const p of data?.prices ?? []) if (p.active && !p.supersededBy) m.set(p.planId, [...(m.get(p.planId) ?? []), p]);
    return m;
  }, [data]);

  const header = (
    <AdminHeader
      title="Pricing"
      intro="What each plan costs and includes, and the fees and limits checkout reads. A new price starts on the next checkout; people already subscribed keep theirs."
      actions={data && <Badge variant={data.livemode ? "warning" : "info"}>{data.livemode ? "Stripe live" : "Stripe test mode"}</Badge>}
    />
  );
  if (error && !data) return <div className="account-card admin-screen">{header}<Alert variant="error">{error}</Alert></div>;
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading pricing" /></div>;

  const levers = new Map(data.levers.map((l) => [l.key, l]));
  const planName = (id: string) => data.plans.find((p) => p.id === id)?.name ?? humanize(id);
  const planOrder = (id: string) => data.plans.find((p) => p.id === id)?.sort ?? 999;
  const plansWith = (...prefixes: string[]) => [...new Set(data.levers.flatMap((l) => prefixes.filter((p) => l.key.startsWith(p)).map((p) => l.key.slice(p.length))))]
    .sort((a, b) => planOrder(a) - planOrder(b));
  const feePlans = plansWith(FEE_PCT, FEE_FIXED);
  const smsPlans = plansWith(SMS_PLAN);

  const priceName = (lookupKey: string) => {
    const pr = data.prices.find((p) => p.lookupKey === lookupKey);
    return pr ? `${planName(pr.planId)}, ${intervalOf(pr.interval).adj}` : lookupKey;
  };
  /** A Stripe webhook row names either a price (lookup key) or a plan. */
  const targetName = (target: string) => (data.prices.some((p) => p.lookupKey === target) ? priceName(target) : planName(target));
  const leverLabel = (key: string): string => {
    if (LEVER_META[key]) return key.startsWith("ai_") ? `AI uses: ${LEVER_META[key].label}` : LEVER_META[key].label;
    if (key.startsWith(FEE_PCT)) return `Ticket fee percent, ${planName(key.slice(FEE_PCT.length))}`;
    if (key.startsWith(FEE_FIXED)) return `Ticket fee per ticket, ${planName(key.slice(FEE_FIXED.length))}`;
    if (key.startsWith(SMS_PLAN)) return `Text segments a month, ${planName(key.slice(SMS_PLAN.length))}`;
    if (key === PROC_PCT) return "Card processing percent";
    if (key === PROC_FIXED) return "Card processing per order";
    return levers.get(key)?.description ?? humanize(key);
  };
  const leverUnit = (key: string): Unit => {
    if (LEVER_META[key]) return LEVER_META[key].unit;
    if (key.startsWith(FEE_PCT) || key === PROC_PCT) return "percent";
    if (key.startsWith(FEE_FIXED) || key === PROC_FIXED) return "money";
    if (key.startsWith(SMS_PLAN)) return "segments";
    const l = levers.get(key);
    return l && isTextLever(l) ? "text" : "count";
  };

  const openEdit = (title: string, help: string, keys: { key: string; label: string }[]) => {
    const fields = keys.flatMap(({ key, label }) => {
      const lever = levers.get(key);
      return lever ? [{ lever, label, unit: leverUnit(key) }] : [];
    });
    if (fields.length === 0) return;
    setEdit({ title, help, fields, drafts: fields.map((f) => draftOf(f.lever, f.unit)) });
  };

  const claimed = new Set<string>([...FEE_KEYS, ...SMS_KEYS, ...LIMIT_KEYS, ...AI_KEYS, PROC_PCT, PROC_FIXED]);
  for (const l of data.levers) if (l.key.startsWith(FEE_PCT) || l.key.startsWith(FEE_FIXED) || l.key.startsWith(SMS_PLAN)) claimed.add(l.key);
  const others = data.levers.filter((l) => !claimed.has(l.key));

  /** One setting per row: what it is, its value, Edit. */
  const settingRows = (keys: string[]) => {
    const rows = keys.filter((k) => levers.has(k));
    if (rows.length === 0) return null;
    return (
      <ul className="admin-money-list">
        {rows.map((key) => {
          const l = levers.get(key)!;
          const meta = LEVER_META[key];
          const label = meta?.label ?? leverLabel(key);
          const help = meta?.help ?? (l.description && l.description !== label ? l.description : "");
          return (
            <li key={key} className="admin-money-row">
              <div className="admin-money-row__text">
                <p className="admin-money-row__name">{label}</p>
                {help && <p className="admin-money-row__help">{help}</p>}
              </div>
              <span className="admin-money-row__value admin-num">{display(l, leverUnit(key))}</span>
              <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit ${label}`} onClick={() => openEdit(label, help, [{ key, label }])}>Edit</Button>
            </li>
          );
        })}
      </ul>
    );
  };

  const procLabel = "Card processing shown to buyers";
  const procHelp = "Stripe's card rate, shown to buyers at checkout. Display only: Stripe charges its real fee.";

  return (
    <div className="account-card admin-screen admin-money">
      {header}

      {data.livemode && <Alert variant="warning" title="Live mode">Price changes here create real Stripe prices that new buyers pay.</Alert>}

      <AdminSection title="Plans and prices" icon={<IconCreditCard size={20} />} intro="Choose a price to change it. A change makes a new Stripe price on the same product and archives the old one.">
        <div className="admin-money-plans">
          {data.plans.map((plan) => {
            const prices = [...(pricesByPlan.get(plan.id) ?? [])].sort((a, b) => INTERVAL_ORDER.indexOf(a.interval) - INTERVAL_ORDER.indexOf(b.interval));
            const limits = Object.entries(plan.limits ?? {}).sort(([a], [b]) => limitOrder(a) - limitOrder(b));
            return (
              <AdminPanel key={plan.id} className="admin-money-plan">
                <div className="admin-money-plan__head">
                  <h3 className="admin-panel__title">{plan.name}</h3>
                  <Badge variant="outline" size="small">{KIND_LABEL[plan.kind] ?? humanize(plan.kind)}</Badge>
                  {!plan.active && <Badge variant="warning" size="small">Not on sale</Badge>}
                  {!plan.stripeProductId && plan.kind !== "tier" && <Badge variant="warning" size="small">Not linked to Stripe yet</Badge>}
                </div>
                <p className="admin-money-plan__for">For: {LINE_LABEL[plan.line] ?? humanize(plan.line)}</p>
                {plan.blurb && <p className="admin-money-plan__blurb">{plan.blurb}</p>}
                {(limits.length > 0 || plan.capabilities.length > 0) && (
                  <dl className="admin-money-limits">
                    {limits.map(([k, v]) => (
                      <div key={k}><dt>{LIMIT_LABEL[k] ?? humanize(k)}</dt><dd className="admin-num">{limitValue(k, v)}</dd></div>
                    ))}
                    {plan.capabilities.length > 0 && <div><dt>Features unlocked</dt><dd className="admin-num">{n(plan.capabilities.length)}</dd></div>}
                  </dl>
                )}
                <div className="admin-money-plan__prices">
                  {plan.kind === "tier" && prices.length === 0 ? (
                    <span className="admin-money-plan__free">Free, no price to set</span>
                  ) : prices.length === 0 ? (
                    <span className="admin-money-plan__free">No price yet</span>
                  ) : prices.map((pr) => (
                    <span key={pr.id} className="admin-money-price">
                      <Button
                        variant="secondary"
                        size="small"
                        aria-label={`Change the ${plan.name} ${intervalOf(pr.interval).adj} price, now ${fmtUsd(pr.amountCents)}`}
                        onClick={() => setPriceEdit({ price: pr, plan, value: (pr.amountCents / 100).toFixed(2) })}
                      >
                        <span className="admin-money-price__amount admin-num">{fmtUsd(pr.amountCents)}</span> {intervalOf(pr.interval).per}
                      </Button>
                      {!pr.stripePriceId && <Badge variant="warning" size="small">Not found in Stripe yet</Badge>}
                    </span>
                  ))}
                </div>
              </AdminPanel>
            );
          })}
        </div>
      </AdminSection>

      <AdminSection title="Ticket fees" icon={<IconTicket size={20} />} intro="Our fee on each paid ticket, by the organizer's plan: a percent of the ticket plus a fixed amount. Worked out at purchase and kept with the order, so a change only affects new orders.">
        {feePlans.length > 0 && (
          <AdminTable label="Ticket fees by plan">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Organizer&apos;s plan</TableHead><TableHead align="right">Percent of ticket</TableHead><TableHead align="right">Plus per ticket</TableHead><TableHead align="right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {feePlans.map((id) => (
                  <TableRow key={id}>
                    <TableCell><strong>{planName(id)}</strong></TableCell>
                    <TableCell align="right" className="admin-num">{display(levers.get(FEE_PCT + id), "percent")}</TableCell>
                    <TableCell align="right" className="admin-num">{display(levers.get(FEE_FIXED + id), "money")}</TableCell>
                    <TableCell align="right">
                      <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit the ticket fee for ${planName(id)}`}
                        onClick={() => openEdit(`Ticket fee, ${planName(id)}`, "A percent of each ticket plus a fixed amount per ticket. Use 0 and 0 to waive it.", [{ key: FEE_PCT + id, label: "Percent of ticket" }, { key: FEE_FIXED + id, label: "Plus per ticket" }])}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
        {settingRows(FEE_KEYS)}
        {(levers.has(PROC_PCT) || levers.has(PROC_FIXED)) && (
          <ul className="admin-money-list">
            <li className="admin-money-row">
              <div className="admin-money-row__text">
                <p className="admin-money-row__name">{procLabel}</p>
                <p className="admin-money-row__help">{procHelp}</p>
              </div>
              <span className="admin-money-row__value admin-num">{display(levers.get(PROC_PCT), "percent")} + {display(levers.get(PROC_FIXED), "money")}</span>
              <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit ${procLabel}`}
                onClick={() => openEdit(procLabel, procHelp, [{ key: PROC_PCT, label: "Percent of order" }, { key: PROC_FIXED, label: "Plus per order" }])}>Edit</Button>
            </li>
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Text messages" icon={<IconMessage size={20} />} intro="Monthly text message allowance by plan, counted in segments (one segment is about 160 characters). 0 turns texts off for that plan. Texts are for organizers only.">
        {smsPlans.length > 0 && (
          <AdminTable label="Text message allowance by plan">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead align="right">Segments a month</TableHead><TableHead align="right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {smsPlans.map((id) => (
                  <TableRow key={id}>
                    <TableCell><strong>{planName(id)}</strong></TableCell>
                    <TableCell align="right" className="admin-num">{display(levers.get(SMS_PLAN + id), "segments")}</TableCell>
                    <TableCell align="right">
                      <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit the text allowance for ${planName(id)}`}
                        onClick={() => openEdit(`Text messages, ${planName(id)}`, "Segments a month for this plan. 0 turns texts off for it.", [{ key: SMS_PLAN + id, label: "Segments a month" }])}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
        {settingRows(SMS_KEYS)}
      </AdminSection>

      {AI_KEYS.some((k) => levers.has(k)) && (
        <AdminSection title="AI allowances" icon={<IconSparkles size={20} />} intro={<>How many AI generations each plan gets. Usage and the same two limits are on <Link href="/account/platform?tab=platform-ai">AI usage</Link>.</>}>
          {settingRows(AI_KEYS)}
        </AdminSection>
      )}

      <AdminSection title="Limits and windows" icon={<IconAdjustments size={20} />}>
        {settingRows(LIMIT_KEYS)}
      </AdminSection>

      {others.length > 0 && (
        <AdminSection title="Other settings" intro="Settings this page doesn't describe yet. Check with a developer what one does before changing it.">
          {settingRows(others.map((l) => l.key))}
        </AdminSection>
      )}

      <AdminSection
        title="Check against Stripe"
        icon={<IconRefresh size={20} />}
        intro="Links any price that isn't linked to Stripe yet, flags prices whose amount differs from Stripe, and lists Stripe prices this page doesn't know about. Stripe's own updates keep this current between checks."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} aria-label="Check Stripe now" loading={busy === "sync"} disabled={busy === "sync"} onClick={() => void runSync()}>Check Stripe now</Button>}
      >
        {sync && (
          <AdminPanel title="Last check">
            <p>{sync.backfilled.length ? `Linked ${sync.backfilled.length} ${sync.backfilled.length === 1 ? "price" : "prices"}: ${sync.backfilled.map(priceName).join(", ")}.` : "Every price was already linked."}</p>
            {sync.amountDrift.length > 0 && (
              <>
                <Alert variant="warning" title="Amounts that differ from Stripe">Stripe is charging a different amount than this page shows for these prices. Change the price here, or fix it in Stripe.</Alert>
                <AdminTable label="Prices whose amount differs from Stripe">
                  <Table variant="striped" dense>
                    <TableHeader><TableRow><TableHead>Price</TableHead><TableHead align="right">Here</TableHead><TableHead align="right">In Stripe</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {sync.amountDrift.map((d) => (
                        <TableRow key={d.lookupKey}>
                          <TableCell>{priceName(d.lookupKey)}<span className="admin-table__sub">Stripe lookup key {d.lookupKey}</span></TableCell>
                          <TableCell align="right" className="admin-num">{fmtUsd(d.table)}</TableCell>
                          <TableCell align="right" className="admin-num">{fmtUsd(d.stripe)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
              </>
            )}
            {sync.unmapped.length > 0 ? (
              <>
                <p>Active Stripe prices this page doesn&apos;t know about. Archive them in Stripe if nothing sells them.</p>
                <AdminTable label="Stripe prices this page doesn't know about">
                  <Table variant="striped" dense>
                    <TableHeader><TableRow><TableHead>Stripe product</TableHead><TableHead align="right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {sync.unmapped.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>{u.product ?? "Unnamed product"}<span className="admin-table__sub">{u.lookupKey ? `Stripe lookup key ${u.lookupKey}` : `Stripe price ${u.id}`}</span></TableCell>
                          <TableCell align="right" className="admin-num">{u.amount != null ? fmtUsd(u.amount) : "Varies"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
              </>
            ) : <p>Stripe has no prices this page doesn&apos;t know about.</p>}
          </AdminPanel>
        )}
      </AdminSection>

      <AdminSection title="Recent changes" icon={<IconHistory size={20} />} intro="The last 25 changes to prices and settings, newest first. Times are Pacific.">
        {data.audit.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconHistory size={28} />} title="No changes yet" description="Price and setting changes show here once someone makes one." />
        ) : (
          <AdminTable label="Recent pricing changes">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>What changed</TableHead><TableHead>Change</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.audit.map((a) => {
                  const d = describeAudit(a, { priceName, planName, targetName, leverLabel, leverUnit });
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="admin-money-nowrap">{when(a.created_at)}</TableCell>
                      <TableCell>{d.what}<span className="admin-table__sub">{d.kind}</span></TableCell>
                      <TableCell className="admin-num">{d.change}</TableCell>
                      <TableCell>{a.actor_id ? data.names?.[a.actor_id] ?? "Staff" : a.action === "sync.webhook" ? "Stripe" : "System"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>

      <Modal
        isOpen={!!priceEdit}
        onClose={() => { if (busy !== "price") setPriceEdit(null); }}
        title={priceEdit ? `Change the ${priceEdit.plan.name} ${intervalOf(priceEdit.price.interval).adj} price` : ""}
        size="small"
        primaryAction={{ label: busy === "price" ? "Saving…" : "Create new price", onClick: () => { if (busy !== "price") void savePrice(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setPriceEdit(null) }}
      >
        {priceEdit && (
          <div className="admin-form">
            <AdminField label="New price (US dollars)" helper={`Now ${fmtUsd(priceEdit.price.amountCents)} ${intervalOf(priceEdit.price.interval).per}.`}>
              {(id, describedBy) => (
                <Input id={id} aria-describedby={describedBy} type="number" inputMode="decimal" step="0.01" min="0" value={priceEdit.value} onChange={(e) => setPriceEdit({ ...priceEdit, value: e.target.value })} fullWidth autoFocus />
              )}
            </AdminField>
            <p className="admin-money-modal__note">New checkouts use the new amount straight away and the current price is archived in Stripe. People already subscribed keep paying {fmtUsd(priceEdit.price.amountCents)}.</p>
            <p className="admin-money-modal__ids">
              Stripe lookup key: {priceEdit.price.lookupKey}
              {priceEdit.price.stripePriceId ? <><br />Stripe price: {priceEdit.price.stripePriceId}</> : <><br />Not found in Stripe yet</>}
              {priceEdit.plan.stripeProductId && <><br />Stripe product: {priceEdit.plan.stripeProductId}</>}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!edit}
        onClose={() => { if (busy !== "lever") setEdit(null); }}
        title={edit ? `Edit: ${edit.title}` : ""}
        size="small"
        primaryAction={{ label: busy === "lever" ? "Saving…" : "Save", onClick: () => { if (busy !== "lever") void saveEdit(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setEdit(null) }}
      >
        {edit && (
          <form className="admin-form" onSubmit={(e) => { e.preventDefault(); if (busy !== "lever") void saveEdit(); }}>
            {edit.help && <p className="admin-money-modal__note">{edit.help}</p>}
            {edit.fields.map((f, i) => {
              const setDraft = (v: string) => setEdit((cur) => cur && { ...cur, drafts: cur.drafts.map((d, j) => (j === i ? v : d)) });
              const unitName = UNIT_FIELD[f.unit];
              const label = `${edit.fields.length > 1 ? f.label : "New value"}${unitName ? ` (${unitName})` : ""}`;
              return (
                <AdminField key={f.lever.key} label={label} helper={`Now ${display(f.lever, f.unit)}. Last changed ${when(f.lever.updatedAt)} Pacific.`}>
                  {(id, describedBy) => f.unit === "payer" ? (
                    <Select id={id} value={edit.drafts[i] || "buyer"} onChange={(v) => setDraft(String(Array.isArray(v) ? v[0] : v))} fullWidth
                      options={[{ value: "buyer", label: "Buyer", description: "Added to the ticket price at checkout" }, { value: "organizer", label: "Organizer", description: "Taken from the organizer's payout" }]} />
                  ) : (
                    <Input id={id} aria-describedby={describedBy} type={f.unit === "text" ? "text" : "number"} inputMode={f.unit === "percent" || f.unit === "money" ? "decimal" : f.unit === "text" ? undefined : "numeric"}
                      step={f.unit === "percent" || f.unit === "money" ? "0.01" : "1"} min={f.unit === "text" ? undefined : "0"} value={edit.drafts[i]} onChange={(e) => setDraft(e.target.value)} fullWidth autoFocus={i === 0} />
                  )}
                </AdminField>
              );
            })}
          </form>
        )}
      </Modal>
    </div>
  );
}

// ── Audit rows in words ──────────────────────────────────────────────────────

const AUDIT_KIND: Record<string, string> = {
  "price.change": "Price changed",
  "lever.set": "Setting changed",
  "plan.update": "Plan edited",
  "sync.webhook": "Updated from Stripe",
  "sync.stripe": "Checked against Stripe",
};

function describeAudit(
  a: AuditRow,
  h: { priceName: (k: string) => string; planName: (id: string) => string; targetName: (k: string) => string; leverLabel: (k: string) => string; leverUnit: (k: string) => Unit },
): { kind: string; what: string; change: string } {
  const before = (a.before ?? {}) as Record<string, unknown>;
  const after = (a.after ?? {}) as Record<string, unknown>;
  const kind = AUDIT_KIND[a.action] ?? humanize(a.action);
  const money = (v: unknown) => (typeof v === "number" ? fmtUsd(v) : "not set");
  switch (a.action) {
    case "price.change":
      return { kind, what: h.priceName(a.target), change: `${money(before.amount_cents)} → ${money(after.amount_cents)}` };
    case "lever.set": {
      const unit = h.leverUnit(a.target);
      const fmt = (o: Record<string, unknown>) => {
        const lever: Lever = { key: a.target, valueNum: typeof o.value_num === "number" ? o.value_num : o.value_num == null ? null : Number(o.value_num), valueText: (o.value_text as string | null) ?? null, description: null, updatedAt: a.created_at };
        return lever.valueNum == null && lever.valueText == null ? "not set" : display(lever, lever.valueText != null && lever.valueNum == null && unit !== "payer" ? "text" : unit);
      };
      return { kind, what: h.leverLabel(a.target), change: `${a.before ? fmt(before) : "not set"} → ${fmt(after)}` };
    }
    case "plan.update": {
      const fields = Object.keys(after).filter((k) => !["updated_at", "updated_by"].includes(k));
      const NAMES: Record<string, string> = { name: "name", blurb: "description", capabilities: "features", limits: "limits", active: "on sale" };
      return { kind, what: h.planName(a.target), change: fields.length ? `Changed ${fields.map((k) => NAMES[k] ?? humanize(k).toLowerCase()).join(", ")}` : "No visible change" };
    }
    case "sync.webhook": {
      if ("amount_cents" in after) return { kind, what: h.priceName(a.target), change: `${money(before.amount_cents)} → ${money(after.amount_cents)}` };
      if ("name" in after) return { kind, what: h.targetName(a.target), change: `Renamed to ${String(after.name)}` };
      if (after.active === false) return { kind, what: h.priceName(a.target), change: "Archived in Stripe" };
      return { kind, what: h.targetName(a.target), change: "Linked to Stripe" };
    }
    case "sync.stripe": {
      const linked = Array.isArray(after.backfilled) ? after.backfilled.length : 0;
      return { kind, what: "All prices", change: `${linked} linked, ${Number(after.drift ?? 0)} differ, ${Number(after.unmapped ?? 0)} unknown` };
    }
    default:
      return { kind, what: a.target, change: "" };
  }
}
