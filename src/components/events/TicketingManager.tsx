"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Modal, Select, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { EventType } from "@/lib/events/calendar";
import type { EventTicketing, PromoCode, TicketOrder, TicketTier } from "@/lib/events/tickets";
import type { ConnectAccount } from "@/lib/events/tickets";
import { ConnectAccountCard } from "@/components/events/ConnectAccountCard";

/**
 * Organizer-side ticketing: payout status, ticket tiers, refund policy, and the
 * orders list with per-order refunds. Sits on both manage pages. An event with
 * no tiers is simply free — nothing here is required.
 */

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

interface Totals { tickets: number; grossCents: number; feesCents: number; netCents: number; refundedCents: number }

interface TierDraft {
  id?: string; name: string; amount: string; quantity: string; description: string;
  perOrderMax: string; salesOpenAt: string; salesCloseAt: string; accessCode: string;
}
interface PromoDraft { id?: string; code: string; kind: "percent" | "amount"; value: string; maxRedemptions: string; tierId: string }

const emptyTier = (): TierDraft => ({ name: "", amount: "", quantity: "", description: "", perOrderMax: "4", salesOpenAt: "", salesCloseAt: "", accessCode: "" });
const emptyPromo = (): PromoDraft => ({ code: "", kind: "percent", value: "", maxRedemptions: "", tierId: "" });

/** <input type="datetime-local"> wants a local "YYYY-MM-DDTHH:mm", not an ISO string. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export function TicketingManager({ type, eventId }: { type: EventType; eventId: string }) {
  const toast = useToast();
  const [account, setAccount] = useState<ConnectAccount | null | undefined>(undefined);
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [ticketing, setTicketing] = useState<EventTicketing | null>(null);
  const [orders, setOrders] = useState<TicketOrder[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<TierDraft | null>(null);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [promosEntitled, setPromosEntitled] = useState(true);
  const [promoEdit, setPromoEdit] = useState<PromoDraft | null>(null);

  const load = useCallback(async () => {
    const [t, s, o, p] = await Promise.all([
      fetch(`/api/events/${type}/${eventId}/tiers?manage=1`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/events/${type}/${eventId}/ticketing`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/events/${type}/${eventId}/orders`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/events/${type}/${eventId}/promos`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setTiers((t?.tiers as TicketTier[]) ?? []);
    setTicketing((s?.ticketing as EventTicketing) ?? null);
    setOrders((o?.orders as TicketOrder[]) ?? []);
    setTotals((o?.totals as Totals) ?? null);
    setPromos((p?.promos as PromoCode[]) ?? []);
    setPromosEntitled(p?.entitled !== false);
  }, [type, eventId]);
  useEffect(() => { void load(); }, [load]);


  const saveTier = async () => {
    if (!edit) return;
    const amountCents = Math.round(Number(edit.amount || "0") * 100);
    if (!edit.name.trim() || !Number.isFinite(amountCents) || amountCents < 0) { toast.error("Name and a valid price are required"); return; }
    setBusy("tier");
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/tiers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: {
          id: edit.id, name: edit.name.trim(), amountCents,
          description: edit.description.trim() || null,
          quantity: edit.quantity ? Number(edit.quantity) : null,
          perOrderMax: Math.min(20, Math.max(1, Number(edit.perOrderMax) || 4)),
          salesOpenAt: fromLocalInput(edit.salesOpenAt),
          salesCloseAt: fromLocalInput(edit.salesCloseAt),
          accessCode: edit.accessCode.trim() || null,
        } }),
      });
      if (!r.ok) { toast.error("Couldn't save the ticket"); return; }
      toast.success(edit.id ? "Ticket updated" : "Ticket added");
      setEdit(null); await load();
    } finally { setBusy(null); }
  };

  const toggleTier = async (tier: TicketTier) => {
    setBusy(tier.id);
    try {
      await fetch(`/api/events/${type}/${eventId}/tiers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId: tier.id, active: !tier.active }) });
      await load();
    } finally { setBusy(null); }
  };

  const saveTicketing = async (patch: Partial<EventTicketing>) => {
    setBusy("policy");
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/ticketing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = (await r.json().catch(() => null)) as { ticketing?: EventTicketing } | null;
      if (j?.ticketing) { setTicketing(j.ticketing); toast.success("Saved"); }
    } finally { setBusy(null); }
  };

  const savePromo = async () => {
    if (!promoEdit) return;
    const raw = Number(promoEdit.value || "0");
    const value = promoEdit.kind === "percent" ? Math.round(raw) : Math.round(raw * 100);
    if (!promoEdit.code.trim() || !Number.isFinite(value) || value <= 0) { toast.error("A code and a discount are required"); return; }
    if (promoEdit.kind === "percent" && value > 100) { toast.error("A percentage can't be over 100"); return; }
    setBusy("promo");
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/promos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promo: {
          id: promoEdit.id, code: promoEdit.code.trim(), kind: promoEdit.kind, value,
          maxRedemptions: promoEdit.maxRedemptions ? Number(promoEdit.maxRedemptions) : null,
          tierId: promoEdit.tierId || null,
        } }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        toast.error(j?.error === "code_taken" ? "That code is already in use on this event" : j?.error === "circuit_required" ? "Promo codes come with Circuit" : "Couldn't save that code");
        return;
      }
      toast.success(promoEdit.id ? "Code updated" : "Code added");
      setPromoEdit(null);
      await load();
    } finally { setBusy(null); }
  };

  const togglePromo = async (p: PromoCode) => {
    setBusy(p.id);
    try {
      await fetch(`/api/events/${type}/${eventId}/promos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ promoId: p.id, active: !p.active }) });
      await load();
    } finally { setBusy(null); }
  };

  const refund = async (order: TicketOrder) => {
    setBusy(order.id);
    try {
      const r = await fetch(`/api/events/orders/${order.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asOrganizer: true }) });
      const j = (await r.json().catch(() => null)) as { refundedCents?: number } | null;
      if (!r.ok) { toast.error("Refund failed"); return; }
      toast.success(j?.refundedCents ? `Refunded ${usd(j.refundedCents)}` : "Refunded");
      await load();
    } finally { setBusy(null); }
  };

  const ready = !!account && (account.transfersEnabled || account.chargesEnabled);

  return (
    <div className="ticketing">
      <h2 className="event-shell__h2">Tickets &amp; payouts</h2>

      {/* Payout account (same card as Account → My Stuff → Payouts) */}
      <ConnectAccountCard onStatus={setAccount} intro="Charging for this event? Connect a payout account with Stripe. It takes a couple of minutes, and GameShuffle never touches your bank details." />

      {/* Tiers */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--spacing-20)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Ticket types</h3>
        <Button size="small" variant="secondary" onClick={() => setEdit(emptyTier())} disabled={!ready}>Add ticket</Button>
      </div>
      {tiers.length === 0 ? (
        <p className="attendees__empty">No tickets — this event is free. Add a ticket type to start charging.</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--spacing-8)", marginTop: "var(--spacing-8)" }}>
          {tiers.map((t) => (
            <Card key={t.id} padding="small">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{t.name}</strong> · {t.amountCents === 0 ? "Free" : usd(t.amountCents)}
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>
                    {" "}· {t.sold} sold{t.quantity != null ? ` of ${t.quantity}` : ""}{!t.active ? " · hidden" : ""}
                  </span>
                  {t.description && <p style={{ margin: "2px 0 0", fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>{t.description}</p>}
                </div>
                <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center" }}>
                  <Switch size="small" checked={t.active} disabled={busy === t.id} onChange={() => void toggleTier(t)} aria-label={`${t.active ? "Hide" : "Show"} ${t.name}`} />
                  <Button size="small" variant="ghost" onClick={() => setEdit({
                    id: t.id, name: t.name, amount: (t.amountCents / 100).toFixed(2),
                    quantity: t.quantity != null ? String(t.quantity) : "", description: t.description ?? "",
                    perOrderMax: String(t.perOrderMax), salesOpenAt: toLocalInput(t.salesOpenAt), salesCloseAt: toLocalInput(t.salesCloseAt),
                    accessCode: t.accessCode ?? "",
                  })}>Edit</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Policy */}
      {ticketing && tiers.length > 0 && (
        <div style={{ marginTop: "var(--spacing-20)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Refunds &amp; fees</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "var(--spacing-12)" }}>
            <label>
              <span className="account-card__label">Refund policy</span>
              <Select value={ticketing.refundPolicy} onChange={(v) => void saveTicketing({ refundPolicy: v as EventTicketing["refundPolicy"] })} fullWidth
                options={[{ value: "until_days_before", label: "Until a few days before" }, { value: "always", label: "Anytime before the event" }, { value: "none", label: "No refunds" }]} />
            </label>
            {ticketing.refundPolicy === "until_days_before" && (
              <label>
                <span className="account-card__label">Days before</span>
                <Input type="number" min="0" max="90" value={String(ticketing.refundDaysBefore)} onChange={(e) => setTicketing({ ...ticketing, refundDaysBefore: Number(e.target.value) })} onBlur={() => void saveTicketing({ refundDaysBefore: ticketing.refundDaysBefore })} fullWidth />
              </label>
            )}
            <label>
              <span className="account-card__label">Fees on refunds</span>
              <Select value={ticketing.feeRefund} onChange={(v) => void saveTicketing({ feeRefund: v as EventTicketing["feeRefund"] })} fullWidth
                options={[{ value: "never", label: "Keep the fees (standard)" }, { value: "always", label: "Refund the fees too" }]} />
            </label>
            <label>
              <span className="account-card__label">Who pays the fees</span>
              <Select value={ticketing.feePayer} onChange={(v) => void saveTicketing({ feePayer: v as EventTicketing["feePayer"] })} fullWidth
                options={[{ value: "buyer", label: "Buyer (added at checkout)" }, { value: "organizer", label: "I absorb them" }]} />
            </label>
          </div>
        </div>
      )}

      {/* Promo codes */}
      {tiers.length > 0 && (
        <div style={{ marginTop: "var(--spacing-20)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-8)" }}>
            <h3 style={{ margin: 0, fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Promo codes</h3>
            {promosEntitled && <Button size="small" variant="secondary" onClick={() => setPromoEdit(emptyPromo())}>Add code</Button>}
          </div>

          {!promosEntitled ? (
            <div style={{ marginTop: "var(--spacing-8)" }}>
              <Alert variant="info">Promo codes come with Circuit. <Link href="/gs-circuit">See Circuit plans</Link>.</Alert>
            </div>
          ) : promos.length === 0 ? (
            <p className="attendees__empty">No codes yet. A code takes money off the ticket price, never off your platform fee.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--spacing-4)", marginTop: "var(--spacing-8)" }}>
              {promos.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-8)", padding: "var(--spacing-8) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", fontSize: "var(--font-size-12)" }}>
                  <span>
                    <strong>{p.code}</strong> · {p.kind === "percent" ? `${p.value}% off` : `${usd(p.value)} off`}
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {" "}· {p.redeemed} used{p.maxRedemptions != null ? ` of ${p.maxRedemptions}` : ""}
                      {p.tierId ? ` · ${tiers.find((t) => t.id === p.tierId)?.name ?? "one ticket"} only` : ""}
                      {!p.active ? " · off" : ""}
                    </span>
                  </span>
                  <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center" }}>
                    <Switch size="small" checked={p.active} disabled={busy === p.id} onChange={() => void togglePromo(p)} aria-label={`${p.active ? "Disable" : "Enable"} ${p.code}`} />
                    <Button size="small" variant="ghost" onClick={() => setPromoEdit({ id: p.id, code: p.code, kind: p.kind, value: p.kind === "percent" ? String(p.value) : (p.value / 100).toFixed(2), maxRedemptions: p.maxRedemptions != null ? String(p.maxRedemptions) : "", tierId: p.tierId ?? "" })}>Edit</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Orders */}
      {totals && totals.tickets > 0 && (
        <div style={{ marginTop: "var(--spacing-20)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Sales</h3>
          <p style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
            <strong>{totals.tickets}</strong> tickets · {usd(totals.grossCents)} collected · {usd(totals.feesCents)} fees · <strong>{usd(totals.netCents)}</strong> yours{totals.refundedCents > 0 ? ` · ${usd(totals.refundedCents)} refunded` : ""}
          </p>
          <div style={{ display: "grid", gap: "var(--spacing-4)" }}>
            {orders.filter((o) => o.status === "paid" || o.status === "refunded").slice(0, 25).map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-8)", padding: "var(--spacing-8) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", fontSize: "var(--font-size-12)" }}>
                <span>{o.buyerName || o.buyerEmail || "Buyer"} · {o.quantity} × {usd(o.unitAmountCents)}{o.status === "refunded" ? ` · refunded ${usd(o.buyerTotalCents - o.subtotalCents > 0 && ticketing?.feeRefund !== "always" ? o.subtotalCents : o.buyerTotalCents)}` : ""}</span>
                {o.status === "paid" && <Button size="small" variant="ghost" onClick={() => void refund(o)} disabled={busy === o.id}>Refund</Button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!ready && tiers.length > 0 && <Alert variant="warning" title="Payouts not ready">Tickets can&apos;t be sold until Stripe finishes verifying your payout account.</Alert>}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit ticket" : "Add ticket"} size="small"
        primaryAction={{ label: busy === "tier" ? "Saving…" : "Save", onClick: () => { if (busy !== "tier") void saveTier(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setEdit(null) }}>
        {edit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="General admission" fullWidth />
            <Input type="number" step="0.01" min="0" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="Price in USD (0 for free)" fullWidth />
            <Input type="number" min="1" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} placeholder="Quantity (blank = unlimited)" fullWidth />
            <Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="What's included (optional)" fullWidth />
            <label>
              <span className="account-card__label">Max per order</span>
              <Input type="number" min="1" max="20" value={edit.perOrderMax} onChange={(e) => setEdit({ ...edit, perOrderMax: e.target.value })} fullWidth />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "var(--spacing-8)" }}>
              <label>
                <span className="account-card__label">Sales open</span>
                <Input type="datetime-local" value={edit.salesOpenAt} onChange={(e) => setEdit({ ...edit, salesOpenAt: e.target.value })} fullWidth />
              </label>
              <label>
                <span className="account-card__label">Sales close</span>
                <Input type="datetime-local" value={edit.salesCloseAt} onChange={(e) => setEdit({ ...edit, salesCloseAt: e.target.value })} fullWidth />
              </label>
            </div>
            <label>
              <span className="account-card__label">Access code (optional)</span>
              <Input value={edit.accessCode} onChange={(e) => setEdit({ ...edit, accessCode: e.target.value })} placeholder="Leave blank for a public ticket" fullWidth />
              <span className="account-card__hint" style={{ fontSize: "var(--font-size-12)" }}>
                Hidden from the event page. Share it as <code>?code=YOURCODE</code> on the link.
              </span>
            </label>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!promoEdit} onClose={() => setPromoEdit(null)} title={promoEdit?.id ? "Edit code" : "Add promo code"} size="small"
        primaryAction={{ label: busy === "promo" ? "Saving…" : "Save", onClick: () => { if (busy !== "promo") void savePromo(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setPromoEdit(null) }}>
        {promoEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
            <Input value={promoEdit.code} onChange={(e) => setPromoEdit({ ...promoEdit, code: e.target.value.toUpperCase().slice(0, 40) })} placeholder="EARLYBIRD" fullWidth />
            <label>
              <span className="account-card__label">Discount</span>
              <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                <Select value={promoEdit.kind} onChange={(v) => setPromoEdit({ ...promoEdit, kind: v as PromoDraft["kind"] })}
                  options={[{ value: "percent", label: "% off" }, { value: "amount", label: "$ off" }]} />
                <Input type="number" min="1" step={promoEdit.kind === "percent" ? "1" : "0.01"} value={promoEdit.value}
                  onChange={(e) => setPromoEdit({ ...promoEdit, value: e.target.value })} placeholder={promoEdit.kind === "percent" ? "10" : "5.00"} fullWidth />
              </div>
            </label>
            <label>
              <span className="account-card__label">Limit (optional)</span>
              <Input type="number" min="1" value={promoEdit.maxRedemptions} onChange={(e) => setPromoEdit({ ...promoEdit, maxRedemptions: e.target.value })} placeholder="Unlimited" fullWidth />
            </label>
            <label>
              <span className="account-card__label">Applies to</span>
              <Select value={promoEdit.tierId} onChange={(v) => setPromoEdit({ ...promoEdit, tierId: v as string })} fullWidth
                options={[{ value: "", label: "Any ticket" }, ...tiers.map((t) => ({ value: t.id, label: t.name }))]} />
            </label>
            <p style={{ margin: 0, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
              The discount comes off the ticket price. Your platform fee is charged on what the buyer actually pays.
            </p>
          </div>
        )}
      </Modal>

      <p style={{ marginTop: "var(--spacing-12)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
        GameShuffle&apos;s platform fee depends on your plan — Circuit lowers or waives it. <Link href="/gs-pro?from=ticketing">See plans</Link>.
      </p>
    </div>
  );
}
