"use client";

/**
 * In-app plan-change manager (gs-circuit-pro-addendum Phase C).
 *
 * Shows the account's current Pro source + renewals and the available plan
 * changes (upgrade / downgrade / add or remove the Pro add-on / switch interval
 * / cancel). Each change previews through `/api/billing/preview` (the pure
 * resolver) and shows a confirm screen with price/credit/offer copy before
 * applying via `/api/billing/change`.
 *
 * Live execution is gated by the `circuit_billing_live` platform flag. While it
 * is OFF (today), the actions render but confirming reports that the change
 * activates at launch — no Stripe operation runs. The component only renders
 * for accounts that actually hold a paid plan.
 */

import { useEffect, useState } from "react";
import { Button, Card, Modal } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { PlanTarget, PlanChangeResult } from "@/lib/billing/planChange";

interface BillingDisplay {
  hasPro: boolean;
  proSourceLabel: string | null;
  proEndsAt: string | null;
  circuitTier: "circuit_64" | "circuit_256" | null;
  circuitRenewal: string | null;
  proRenewal: string | null;
}
interface PlanStateLite {
  proStandalone: { status: "trial" | "active"; interval: "monthly" | "annual" } | null;
  circuit: { tier: "circuit_64" | "circuit_256"; interval: "monthly" | "annual"; proAddon: boolean } | null;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

interface Action { label: string; target: PlanTarget; destructive?: boolean }

/** The plan changes available from a given state. */
function actionsFor(state: PlanStateLite): Action[] {
  const out: Action[] = [];
  const c = state.circuit;
  if (c?.tier === "circuit_256") {
    out.push({ label: "Downgrade to Circuit 64", target: { kind: "downgrade_to_circuit_64" } });
    out.push({ label: `Switch to ${c.interval === "monthly" ? "annual" : "monthly"} billing`, target: { kind: "switch_interval", interval: c.interval === "monthly" ? "annual" : "monthly" } });
    out.push({ label: "Cancel Circuit", target: { kind: "cancel_circuit" }, destructive: true });
  } else if (c?.tier === "circuit_64") {
    out.push({ label: "Upgrade to Circuit 256", target: { kind: "subscribe_circuit", tier: "circuit_256", interval: c.interval } });
    if (c.proAddon) out.push({ label: "Remove the Pro add-on", target: { kind: "remove_pro_addon" }, destructive: true });
    else out.push({ label: "Add GameShuffle Pro ($5/mo)", target: { kind: "add_pro_addon" } });
    out.push({ label: `Switch to ${c.interval === "monthly" ? "annual" : "monthly"} billing`, target: { kind: "switch_interval", interval: c.interval === "monthly" ? "annual" : "monthly" } });
    out.push({ label: "Cancel Circuit", target: { kind: "cancel_circuit" }, destructive: true });
  } else if (state.proStandalone) {
    out.push({ label: `Switch to ${state.proStandalone.interval === "monthly" ? "annual" : "monthly"} billing`, target: { kind: "switch_interval", interval: state.proStandalone.interval === "monthly" ? "annual" : "monthly" } });
    out.push({ label: "Cancel Pro", target: { kind: "cancel_pro" }, destructive: true });
  }
  return out;
}

export function BillingManager() {
  const toast = useToast();
  const [display, setDisplay] = useState<BillingDisplay | null>(null);
  const [state, setState] = useState<PlanStateLite | null>(null);
  const [billingLive, setBillingLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Action | null>(null);
  const [preview, setPreview] = useState<PlanChangeResult | null>(null);
  const [working, setWorking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/state");
        const j = await res.json();
        if (!cancelled && j.ok) {
          setDisplay(j.display);
          setState(j.state);
          setBillingLive(!!j.billingLive);
        }
      } catch { /* leave unrendered */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const openConfirm = async (action: Action) => {
    setPending(action);
    setPreview(null);
    try {
      const res = await fetch("/api/billing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: action.target }),
      });
      const j = await res.json();
      if (j.ok) setPreview(j.preview as PlanChangeResult);
      else { toast.error("Couldn't preview that change."); setPending(null); }
    } catch { toast.error("Couldn't preview that change."); setPending(null); }
  };

  const confirmChange = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      const res = await fetch("/api/billing/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: pending.target }),
      });
      const j = await res.json();
      if (j.ok) {
        toast.success("Plan updated.");
        setReloadKey((k) => k + 1);
      } else if (j.reason === "billing_not_live" || j.reason === "executor_not_implemented") {
        toast.success("Saved — this change activates when billing launches.");
      } else {
        toast.error("Couldn't apply that change.");
      }
    } catch { toast.error("Couldn't apply that change."); }
    setWorking(false);
    setPending(null);
    setPreview(null);
  };

  // Only render for accounts that actually hold a paid plan to manage.
  if (loading || !display || !state || (!state.circuit && !state.proStandalone)) return null;

  const actions = actionsFor(state);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "var(--font-size-18)", fontWeight: 700, margin: 0 }}>Manage your plan</h3>
          <p style={{ fontSize: "var(--font-size-13)", color: "var(--text-secondary)", margin: "var(--spacing-4) 0 0" }}>
            Change your plan directly here — upgrades apply right away, downgrades and cancellations at the end of your period.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)", marginTop: "var(--spacing-12)", fontSize: "var(--font-size-14)" }}>
        {display.proSourceLabel && (
          <Row label="GameShuffle Pro" value={display.proSourceLabel} />
        )}
        {display.circuitTier && (
          <Row label="Circuit plan" value={display.circuitTier === "circuit_256" ? "Circuit 256" : "Circuit 64"} />
        )}
        {display.circuitRenewal && <Row label="Circuit renews" value={fmt(display.circuitRenewal)} />}
        {display.proRenewal && !display.circuitTier && <Row label="Pro renews" value={fmt(display.proRenewal)} />}
      </div>

      {!billingLive && (
        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", margin: "var(--spacing-12) 0 0" }}>
          In-app plan changes go live with Circuit billing. You can preview any change now.
        </p>
      )}

      {actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)", marginTop: "var(--spacing-16)" }}>
          {actions.map((a) => (
            <Button key={a.label} variant={a.destructive ? "danger" : "secondary"} size="small" onClick={() => openConfirm(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!pending}
        onClose={() => { setPending(null); setPreview(null); }}
        title={pending?.label ?? "Confirm change"}
        size="small"
        destructive={pending?.destructive}
        primaryAction={preview ? { label: billingLive ? "Confirm" : "Preview only", onClick: confirmChange } : undefined}
        secondaryAction={{ label: "Back", onClick: () => { setPending(null); setPreview(null); } }}
      >
        {!preview ? (
          <p>Loading preview…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)", fontSize: "var(--font-size-14)" }}>
            {preview.notice && <p style={{ margin: 0 }}>{preview.notice}</p>}
            {preview.confirm?.creditNote && (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>{preview.confirm.creditNote}</p>
            )}
            {preview.offer && (
              <div style={{ padding: "var(--spacing-12)", borderRadius: "0.6rem", background: "color-mix(in srgb, var(--primary-500) 8%, var(--surface-default))", border: "1px solid var(--primary-300, var(--border-default))" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Optional</p>
                <p style={{ margin: "var(--spacing-4) 0 0", color: "var(--text-secondary)" }}>{preview.offer.prompt}</p>
              </div>
            )}
            {working && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Working…</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)" }}>
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
