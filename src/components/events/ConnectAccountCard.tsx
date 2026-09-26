"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { ConnectAccount } from "@/lib/events/tickets";

/**
 * The organizer's Stripe payout account: status, onboarding, and the link into
 * Stripe's own dashboard. Shared by the Payouts tab and each event's ticketing
 * panel so an organizer never sees two different accounts of the same truth.
 *
 * Readiness is the `transfers` capability, not `charges_enabled`: GameShuffle
 * makes the charge and transfers the organizer's share, so that is the only
 * capability their account actually needs.
 */
export function ConnectAccountCard({ onStatus, intro }: { onStatus?: (a: ConnectAccount | null) => void; intro?: string }) {
  const toast = useToast();
  const [account, setAccount] = useState<ConnectAccount | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback((a: ConnectAccount | null) => { setAccount(a); onStatus?.(a); }, [onStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connect").then((r) => (r.ok ? r.json() : null))
      .then((j: { account?: ConnectAccount | null } | null) => { if (!cancelled) apply(j?.account ?? null); })
      .catch(() => { if (!cancelled) apply(null); });
    return () => { cancelled = true; };
  }, [apply]);

  // Returning from Stripe's hosted onboarding: pull the new status straight
  // away rather than leaving the organizer staring at "Setup incomplete".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("payouts")) return;
    url.searchParams.delete("payouts");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { account?: ConnectAccount | null } | null) => { if (j?.account !== undefined) apply(j.account ?? null); })
      .catch(() => {});
  }, [apply]);

  const act = async (action: "onboard" | "dashboard" | "refresh") => {
    setBusy(action);
    try {
      const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined;
      const r = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, returnTo }) });
      const j = (await r.json().catch(() => null)) as { url?: string; account?: ConnectAccount | null; error?: string } | null;
      if (!r.ok) { toast.error(j?.error ?? "Couldn't reach Stripe"); return; }
      if (j?.url) { window.location.href = j.url; return; }
      if (j?.account !== undefined) { apply(j.account ?? null); toast.success("Payout status refreshed"); }
    } finally { setBusy(null); }
  };

  if (account === undefined) return <p className="attendees__empty">Loading…</p>;

  if (!account) {
    return (
      <Card padding="medium">
        <p style={{ margin: "0 0 var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
          {intro ?? "Charging for an event? Connect a payout account with Stripe. It takes a couple of minutes, and GameShuffle never touches your bank details."}
        </p>
        <Button variant="primary" onClick={() => void act("onboard")} disabled={busy === "onboard"}>
          {busy === "onboard" ? "Opening Stripe…" : "Set up payouts"}
        </Button>
      </Card>
    );
  }

  const ready = account.transfersEnabled || account.chargesEnabled;
  return (
    <Card padding="medium">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <Badge variant={ready ? "success" : "warning"}>{ready ? "Payouts ready" : "Setup incomplete"}</Badge>
          {ready && account.payoutsEnabled && (
            <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
              Stripe pays out to your bank automatically.
            </p>
          )}
          {!ready && account.requirementsDue.length > 0 && (
            <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
              Stripe still needs: {account.requirementsDue.slice(0, 4).join(", ")}
            </p>
          )}
          {account.disabledReason && (
            <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--warning-ink)" }}>{account.disabledReason}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          {!ready && <Button size="small" variant="primary" onClick={() => void act("onboard")} disabled={busy === "onboard"}>Finish setup</Button>}
          {ready && <Button size="small" variant="secondary" onClick={() => void act("dashboard")} disabled={busy === "dashboard"}>Stripe dashboard</Button>}
          <Button size="small" variant="ghost" onClick={() => void act("refresh")} disabled={busy === "refresh"}>Refresh</Button>
        </div>
      </div>
    </Card>
  );
}
