"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@empac/cascadeds";

/**
 * What the buyer lands on coming back from Stripe. It confirms the order (the
 * webhook may not have arrived yet), says so plainly, then drops the query
 * params so a refresh or a shared link isn't stuck showing a receipt.
 */
export function TicketResult() {
  // useSearchParams needs a boundary so it can never opt a page into bailout.
  return <Suspense fallback={null}><TicketResultInner /></Suspense>;
}

function TicketResultInner() {
  const router = useRouter();
  const params = useSearchParams();
  const state = params.get("ticket");
  const orderId = params.get("order");
  const [status, setStatus] = useState<"working" | "done" | "pending">("working");

  useEffect(() => {
    if (state !== "success" || !orderId) return;
    let cancelled = false;
    fetch(`/api/events/orders/${orderId}/confirm`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; status?: string } | null) => {
        if (cancelled) return;
        setStatus(j?.status === "paid" ? "done" : "pending");
        router.refresh();
      })
      .catch(() => { if (!cancelled) setStatus("pending"); });
    return () => { cancelled = true; };
  }, [state, orderId, router]);

  if (state !== "success" && state !== "cancelled") return null;

  const clear = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("ticket"); next.delete("order");
    router.replace(next.size ? `?${next}` : window.location.pathname, { scroll: false });
  };

  if (state === "cancelled") {
    return <Alert variant="info" onClose={clear}>Checkout cancelled. Nothing was charged, and your seat was released.</Alert>;
  }
  if (status === "working") return <Alert variant="info">Confirming your payment…</Alert>;
  if (status === "pending") {
    return <Alert variant="info" onClose={clear}>Payment received. Your ticket will appear here in a moment, and we&apos;ll email it to you.</Alert>;
  }
  return <Alert variant="success" onClose={clear} title="You&apos;re in">Your ticket is below. Stripe emailed your receipt.</Alert>;
}
