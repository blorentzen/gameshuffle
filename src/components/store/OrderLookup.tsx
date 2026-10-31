"use client";

/**
 * /shop/orders: find an order with its number plus the email or phone used at
 * checkout. We send a 6-digit code there; the right code unlocks the order in
 * this browser (signed cookie) and opens it.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@empac/cascadeds";

const START_ERRORS: Record<string, string> = {
  bad_order: "Check the order number. It's in your order email and starts with GS.",
  bad_contact: "Enter the email or the 10-digit phone number you used at checkout.",
  sms_unavailable: "We can't send texts right now. Try your email instead.",
  rate_limited: "Too many tries. Wait 15 minutes and try again.",
};
const CODE_ERRORS: Record<string, string> = {
  expired: "That code has expired. Send a new one.",
  too_many: "Too many wrong codes. Send a new one.",
  rate_limited: "Too many tries. Wait 15 minutes and try again.",
};

export function OrderLookup({ initialOrder, linkExpired, signedIn }: { initialOrder: string; linkExpired: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState<{ lookupId: string; channel: "email" | "sms"; sentTo: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch("/api/shop/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order, contact }) })
      .then((res) => res.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError(START_ERRORS[r?.error] ?? "That didn't work. Try again in a minute."); return; }
    setSent({ lookupId: r.lookupId, channel: r.channel, sentTo: r.sentTo });
    setCode("");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch("/api/shop/orders/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookupId: sent?.lookupId, code }) })
      .then((res) => res.json()).catch(() => null);
    if (r?.ok) { router.push(`/shop/orders/${r.orderCode}`); return; }
    setBusy(false);
    if (r?.error === "wrong_code") setError(r.attemptsLeft ? `That code isn't right. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? "try" : "tries"} left.` : "That code isn't right.");
    else setError(CODE_ERRORS[r?.error] ?? "That didn't work. Try again in a minute.");
  };

  return (
    <div className="shop-lookup">
      {linkExpired && !sent && <Alert variant="info" title="That link has expired">Find your order below and we&apos;ll send you a code.</Alert>}
      {!sent ? (
        <form className="shop-lookup__form" onSubmit={start} noValidate>
          <Input fullWidth floatingLabel="Order number (like GS-1005)" value={order} onChange={(e) => setOrder(e.target.value)} autoComplete="off" inputMode="text" required />
          <Input fullWidth floatingLabel="Email or phone used at checkout" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" required />
          {error && <p className="shop-lookup__error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" fullWidth disabled={busy || !order.trim() || !contact.trim()}>{busy ? "Sending" : "Send me a code"}</Button>
        </form>
      ) : (
        <form className="shop-lookup__form" onSubmit={verify} noValidate>
          <p className="shop-lookup__sent" aria-live="polite">
            {sent.channel === "email" ? "If that matches the order, we emailed a code to " : "If that matches the order, we texted a code to "}
            <strong>{sent.sentTo}</strong>. It works for 10 minutes.
          </p>
          <Input fullWidth floatingLabel="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" required />
          {error && <p className="shop-lookup__error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" fullWidth disabled={busy || code.length !== 6}>{busy ? "Checking" : "Show my order"}</Button>
          <div className="shop-lookup__again">
            <Button type="button" variant="ghost" size="small" disabled={busy} onClick={() => void start()}>Send a new code</Button>
            <Button type="button" variant="ghost" size="small" disabled={busy} onClick={() => { setSent(null); setError(null); }}>Use a different email or phone</Button>
          </div>
        </form>
      )}
      <p className="shop-lookup__note">
        {signedIn
          ? <>Orders placed with your account are in <Link href="/account/stuff?tab=orders">My Stuff</Link>.</>
          : <>Have a GameShuffle account? <Link href={`/login?redirect=${encodeURIComponent("/account/stuff?tab=orders")}`}>Sign in</Link> to see orders placed with it.</>}
      </p>
    </div>
  );
}
