"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Select } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { EventType } from "@/lib/events/calendar";
import type { TicketTier, TicketQuote } from "@/lib/events/tickets";

/**
 * Buyer-side ticket picker for the event shell's action panel. Renders nothing
 * when the event has no tiers (free events keep their register / RSVP card).
 * Shows an itemised quote before checkout — face value, our platform fee and
 * the card processing estimate — so nothing is a surprise at Stripe.
 */

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function TicketPurchase({ type, eventId, soldOutHint }: { type: EventType; eventId: string; soldOutHint?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [tiers, setTiers] = useState<TicketTier[] | null>(null);
  const [tierId, setTierId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<TicketQuote | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${type}/${eventId}/tiers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tiers: TicketTier[] } | null) => {
        if (cancelled || !j) return;
        setTiers(j.tiers);
        const first = j.tiers.find((t) => t.quantity == null || t.sold < t.quantity) ?? j.tiers[0];
        if (first) setTierId(first.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [type, eventId]);

  const tier = useMemo(() => tiers?.find((t) => t.id === tierId) ?? null, [tiers, tierId]);

  const refreshQuote = useCallback(() => {
    if (!tierId) return;
    fetch(`/api/events/${type}/${eventId}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId, quantity: qty, quoteOnly: true }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { quote: TicketQuote } | null) => { if (j) setQuote(j.quote); })
      .catch(() => {});
  }, [type, eventId, tierId, qty]);
  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  if (!tiers || tiers.length === 0) return null;

  const remaining = tier?.quantity != null ? Math.max(0, tier.quantity - tier.sold) : null;
  const soldOut = remaining === 0;
  const needsEmail = !user && type === "tournament";

  const buy = async () => {
    if (needsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error("Enter a valid email for your ticket"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId, quantity: qty, email: needsEmail ? email : undefined, name: needsEmail ? name : undefined }),
      });
      const j = (await r.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!r.ok || !j?.url) {
        const map: Record<string, string> = {
          organizer_not_ready: "The organizer hasn't finished setting up payouts yet.",
          tier_sold_out: "That ticket just sold out.",
          event_full: "This event just filled up.",
          sales_closed: "Ticket sales have closed.",
          sales_not_open: "Ticket sales haven't opened yet.",
          sign_in_required: "Sign in to buy a ticket for a game night.",
        };
        toast.error(map[j?.error ?? ""] ?? "Couldn't start checkout");
        return;
      }
      window.location.href = j.url;
    } finally { setBusy(false); }
  };

  return (
    <div className="comp-card tickets">
      <h2 className="event-shell__h2">Tickets</h2>

      {tiers.length > 1 ? (
        <Select value={tierId} onChange={(v) => setTierId(v as string)} fullWidth
          options={tiers.map((t) => ({ value: t.id, label: `${t.name} — ${t.amountCents === 0 ? "Free" : usd(t.amountCents)}${t.quantity != null && t.sold >= t.quantity ? " (sold out)" : ""}`, disabled: t.quantity != null && t.sold >= t.quantity }))} />
      ) : tier ? (
        <div className="tickets__single">
          <span className="tickets__name">{tier.name}</span>
          <span className="tickets__price">{tier.amountCents === 0 ? "Free" : usd(tier.amountCents)}</span>
        </div>
      ) : null}
      {tier?.description && <p className="tickets__desc">{tier.description}</p>}
      {remaining != null && remaining > 0 && remaining <= 10 && <p className="tickets__left">{remaining} left</p>}

      {soldOut ? (
        <Alert variant="info">{soldOutHint ?? "This ticket is sold out."}</Alert>
      ) : (
        <>
          {(tier?.perOrderMax ?? 1) > 1 && (
            <label className="tickets__qty">
              <span>Quantity</span>
              <Select value={String(qty)} onChange={(v) => setQty(Number(v))}
                options={Array.from({ length: Math.min(tier?.perOrderMax ?? 1, remaining ?? tier?.perOrderMax ?? 1) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
            </label>
          )}

          {needsEmail && (
            <div className="tickets__guest">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for your ticket" fullWidth />
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" fullWidth />
            </div>
          )}

          {quote && quote.subtotalCents > 0 && (
            <dl className="tickets__quote">
              <div><dt>{quote.quantity} × ticket</dt><dd>{usd(quote.subtotalCents)}</dd></div>
              {quote.feePayer === "buyer" && quote.platformFeeCents > 0 && <div><dt>Service fee</dt><dd>{usd(quote.platformFeeCents)}</dd></div>}
              {quote.feePayer === "buyer" && <div><dt>Card processing</dt><dd>{usd(quote.processingFeeCents)}</dd></div>}
              <div className="tickets__quote-total"><dt>Total</dt><dd>{usd(quote.buyerTotalCents)}</dd></div>
            </dl>
          )}

          <Button variant="primary" fullWidth onClick={() => void buy()} disabled={busy || !tierId}>
            {busy ? "Opening checkout…" : quote && quote.buyerTotalCents > 0 ? `Get tickets · ${usd(quote.buyerTotalCents)}` : "Get ticket"}
          </Button>
          <p className="tickets__fineprint">Secure checkout by Stripe. You&apos;ll get a QR ticket right after paying.</p>
        </>
      )}
    </div>
  );
}
