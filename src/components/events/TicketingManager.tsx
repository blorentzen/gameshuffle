"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Modal, Select, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { EventType } from "@/lib/events/calendar";
import type { EventTicketing, TicketOrder, TicketTier } from "@/lib/events/tickets";
import type { ConnectAccount } from "@/lib/events/tickets";

/**
 * Organizer-side ticketing: payout status, ticket tiers, refund policy, and the
 * orders list with per-order refunds. Sits on both manage pages. An event with
 * no tiers is simply free — nothing here is required.
 */

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

interface Totals { tickets: number; grossCents: number; feesCents: number; refundedCents: number }

export function TicketingManager({ type, eventId }: { type: EventType; eventId: string }) {
  const toast = useToast();
  const [account, setAccount] = useState<ConnectAccount | null | undefined>(undefined);
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [ticketing, setTicketing] = useState<EventTicketing | null>(null);
  const [orders, setOrders] = useState<TicketOrder[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id?: string; name: string; amount: string; quantity: string; description: string } | null>(null);

  const load = useCallback(async () => {
    const [a, t, s, o] = await Promise.all([
      fetch("/api/connect").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/events/${type}/${eventId}/tiers?manage=1`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/events/${type}/${eventId}/ticketing`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/events/${type}/${eventId}/orders`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setAccount((a?.account as ConnectAccount | null) ?? null);
    setTiers((t?.tiers as TicketTier[]) ?? []);
    setTicketing((s?.ticketing as EventTicketing) ?? null);
    setOrders((o?.orders as TicketOrder[]) ?? []);
    setTotals((o?.totals as Totals) ?? null);
  }, [type, eventId]);
  useEffect(() => { void load(); }, [load]);

  const connect = async (action: "onboard" | "dashboard" | "refresh") => {
    setBusy(action);
    try {
      const r = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = (await r.json().catch(() => null)) as { url?: string; account?: ConnectAccount; error?: string } | null;
      if (!r.ok) { toast.error(j?.error ?? "Couldn't reach Stripe"); return; }
      if (j?.url) { window.location.href = j.url; return; }
      if (j?.account !== undefined) { setAccount(j.account); toast.success("Payout status refreshed"); }
    } finally { setBusy(null); }
  };

  const saveTier = async () => {
    if (!edit) return;
    const amountCents = Math.round(Number(edit.amount || "0") * 100);
    if (!edit.name.trim() || !Number.isFinite(amountCents) || amountCents < 0) { toast.error("Name and a valid price are required"); return; }
    setBusy("tier");
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/tiers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: { id: edit.id, name: edit.name.trim(), amountCents, description: edit.description.trim() || null, quantity: edit.quantity ? Number(edit.quantity) : null } }),
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

  const refund = async (order: TicketOrder) => {
    setBusy(order.id);
    try {
      const r = await fetch(`/api/events/orders/${order.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asOrganizer: true }) });
      if (!r.ok) { toast.error("Refund failed"); return; }
      toast.success("Refunded");
      await load();
    } finally { setBusy(null); }
  };

  const ready = !!account?.chargesEnabled;

  return (
    <div className="ticketing">
      <h2 className="event-shell__h2">Tickets &amp; payouts</h2>

      {/* Payout account */}
      {account === undefined ? <p className="attendees__empty">Loading…</p> : !account ? (
        <Card padding="medium">
          <p style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Charging for this event? Connect a payout account with Stripe. It takes a couple of minutes, and GameShuffle never touches your bank details.
          </p>
          <Button variant="primary" onClick={() => void connect("onboard")} disabled={busy === "onboard"}>{busy === "onboard" ? "Opening Stripe…" : "Set up payouts"}</Button>
        </Card>
      ) : (
        <Card padding="medium">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <Badge variant={ready ? "success" : "warning"}>{ready ? "Payouts ready" : "Setup incomplete"}</Badge>
              {!ready && account.requirementsDue.length > 0 && (
                <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>Stripe still needs: {account.requirementsDue.slice(0, 4).join(", ")}</p>
              )}
              {account.disabledReason && <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--warning-700)" }}>{account.disabledReason}</p>}
            </div>
            <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
              {!ready && <Button size="small" variant="primary" onClick={() => void connect("onboard")} disabled={busy === "onboard"}>Finish setup</Button>}
              {ready && <Button size="small" variant="secondary" onClick={() => void connect("dashboard")} disabled={busy === "dashboard"}>Stripe dashboard</Button>}
              <Button size="small" variant="ghost" onClick={() => void connect("refresh")} disabled={busy === "refresh"}>Refresh</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tiers */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--spacing-20)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Ticket types</h3>
        <Button size="small" variant="secondary" onClick={() => setEdit({ name: "", amount: "", quantity: "", description: "" })} disabled={!ready}>Add ticket</Button>
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
                  <Button size="small" variant="ghost" onClick={() => setEdit({ id: t.id, name: t.name, amount: (t.amountCents / 100).toFixed(2), quantity: t.quantity != null ? String(t.quantity) : "", description: t.description ?? "" })}>Edit</Button>
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
              <span className="account-card__label">Who pays the fees</span>
              <Select value={ticketing.feePayer} onChange={(v) => void saveTicketing({ feePayer: v as EventTicketing["feePayer"] })} fullWidth
                options={[{ value: "buyer", label: "Buyer (added at checkout)" }, { value: "organizer", label: "I absorb them" }]} />
            </label>
          </div>
        </div>
      )}

      {/* Orders */}
      {totals && totals.tickets > 0 && (
        <div style={{ marginTop: "var(--spacing-20)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)" }}>Sales</h3>
          <p style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
            <strong>{totals.tickets}</strong> tickets · {usd(totals.grossCents)} gross · {usd(totals.feesCents)} platform fees{totals.refundedCents > 0 ? ` · ${usd(totals.refundedCents)} refunded` : ""}
          </p>
          <div style={{ display: "grid", gap: "var(--spacing-4)" }}>
            {orders.filter((o) => o.status === "paid" || o.status === "refunded").slice(0, 25).map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-8)", padding: "var(--spacing-8) 0", borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", fontSize: "var(--font-size-13, 13px)" }}>
                <span>{o.buyerName || o.buyerEmail || "Buyer"} · {o.quantity} × {usd(o.unitAmountCents)}{o.status === "refunded" ? " · refunded" : ""}</span>
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
          </div>
        )}
      </Modal>

      <p style={{ marginTop: "var(--spacing-12)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
        GameShuffle&apos;s platform fee depends on your plan — Circuit lowers or waives it. <Link href="/gs-pro">See plans</Link>.
      </p>
    </div>
  );
}
