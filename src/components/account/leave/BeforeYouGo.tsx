"use client";

/**
 * "Before you go": the step before cancelling GS Pro, GS Circuit or monthly support. One CDS Modal with
 * when the plan ends (when the screen knows), an optional reason from the shared list
 * (src/lib/account/leaveReasons.ts) and an optional comment. Continue saves the answer
 * (POST /api/account/leave-feedback) and opens Stripe's customer portal straight on the cancel page for
 * that subscription (POST /api/stripe/portal with a subscription_cancel flow). A save that fails never
 * stops the cancel; Stripe does the cancelling, so nothing ends until the person confirms there.
 *
 *   <CancelPlanButton product="pro" endsLine="If you cancel, GS Pro stays on until May 3, 2027." keepLabel="Keep GS Pro" />
 */

import { useState } from "react";
import { Alert, Button, Modal, Select, Textarea } from "@empac/cascadeds";
import { AdminField } from "@/components/account/admin/AdminKit";
import { LEAVE_COMMENT_MAX, LEAVE_NONE, LEAVE_REASON_OPTIONS, type LeaveProduct } from "@/lib/account/leaveReasons";
import "@/styles/leave-reasons.css";

const ERRORS: Record<string, string> = {
  already_ending: "This plan is already set to end. Use Manage billing if you'd like to keep it.",
  slow_down: "That's a few tries in a row. Wait a few minutes, then try again.",
};

export function BeforeYouGo({ isOpen, onClose, product, endsLine, keepLabel }: {
  isOpen: boolean;
  onClose: () => void;
  product: LeaveProduct;
  /** One sentence saying when the plan ends, from data the screen already has. */
  endsLine?: string | null;
  /** "Keep GS Pro", "Keep supporting". */
  keepLabel: string;
}) {
  const [reason, setReason] = useState(LEAVE_NONE);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { if (!busy) { setError(null); onClose(); } };

  const proceed = async () => {
    setBusy(true);
    setError(null);
    let subscriptionId: string | undefined;
    // Save why first. Only a plan already ending (or too many tries) stops here; anything else goes on to Stripe.
    try {
      const res = await fetch("/api/account/leave-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, reason: reason === LEAVE_NONE ? null : reason, comment: comment.trim() || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; subscriptionId?: string };
      if (!res.ok && (body.error === "already_ending" || body.error === "slow_down")) { setError(ERRORS[body.error]); setBusy(false); return; }
      if (res.ok && body.subscriptionId) subscriptionId = body.subscriptionId;
    } catch { /* go on: the cancel matters more than the answer */ }

    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow: { type: "subscription_cancel", product, ...(subscriptionId ? { subscriptionId } : {}) } }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) { window.location.assign(body.url); return; }
      // Already ending or too many tries: say so. Anything else (Stripe refused the cancel page, or our copy of the
      // plan is out of date) falls through to the portal home.
      if (body.error === "already_ending" || body.error === "slow_down") { setError(ERRORS[body.error]); setBusy(false); return; }
      // Stripe wouldn't open its cancel page directly: open the billing portal's home instead, where the plan can
      // still be cancelled, so nobody is ever stuck here.
      const home = await fetch("/api/stripe/portal", { method: "POST" }).catch(() => null);
      const homeBody = home ? ((await home.json().catch(() => ({}))) as { url?: string }) : {};
      if (home?.ok && homeBody.url) { window.location.assign(homeBody.url); return; }
      setError("Couldn't open Stripe's cancel page. Try again in a moment.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Before you go"
      size="small"
      className="leave-modal"
      footer={(
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>{keepLabel}</Button>
          <Button variant="primary" onClick={() => void proceed()} loading={busy} disabled={busy}>Continue to cancel</Button>
        </>
      )}
    >
      <div className="leave-form">
        {endsLine && <p className="leave-form__ends">{endsLine}</p>}
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
        <AdminField label="What's the main reason? (optional)">
          {(id) => <Select id={id} fullWidth value={reason} onChange={(v) => setReason(String(v))} options={LEAVE_REASON_OPTIONS} />}
        </AdminField>
        <AdminField label="Anything else? (optional)" helper="Only the team reads this.">
          {(id, describedBy) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              fullWidth
              rows={3}
              maxLength={LEAVE_COMMENT_MAX}
              placeholder="What would have made you stay?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          )}
        </AdminField>
      </div>
    </Modal>
  );
}

/** The "Cancel …" button and its Before you go window. */
export function CancelPlanButton({ product, label, keepLabel, endsLine, size = "medium" }: {
  product: LeaveProduct;
  label: string;
  keepLabel: string;
  endsLine?: string | null;
  size?: "small" | "medium";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size={size} onClick={() => setOpen(true)}>{label}</Button>
      <BeforeYouGo isOpen={open} onClose={() => setOpen(false)} product={product} endsLine={endsLine} keepLabel={keepLabel} />
    </>
  );
}
