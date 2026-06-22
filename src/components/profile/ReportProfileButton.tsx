"use client";

/**
 * Low-key "Report" affordance on a public profile. Opens a modal (reason +
 * optional details); anon reporters clear Turnstile, signed-in reporters
 * don't. Hidden on your own profile. Posts to /api/reports.
 */

import { useState } from "react";
import { Alert, Button, FormField, Modal, Select, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { REPORT_REASONS } from "@/lib/moderation/reasons";

export function ReportProfileButton({ targetUserId }: { targetUserId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Don't offer "report" on your own profile.
  if (user?.id === targetUserId) return null;

  async function submit() {
    setError(null);
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    if (!user && !token) {
      setError("Please complete the security check.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          reason,
          details: details.trim() || undefined,
          turnstileToken: token,
        }),
      });
      if (!res.ok) {
        setError("Couldn't submit the report. Please try again.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="report-profile-trigger"
        onClick={() => setOpen(true)}
      >
        ⚐ Report this profile
      </button>

      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title="Report this profile"
          footer={
            done ? (
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            ) : (
              <div style={{ display: "flex", gap: "var(--spacing-8)", justifyContent: "flex-end" }}>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" loading={submitting} onClick={() => void submit()}>
                  Submit report
                </Button>
              </div>
            )
          }
        >
          {done ? (
            <Alert variant="success">
              Thanks — our team will review this profile.
            </Alert>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
              {error ? <Alert variant="error">{error}</Alert> : null}
              <FormField label="Reason" htmlFor="report-reason">
                <Select
                  id="report-reason"
                  fullWidth
                  value={reason}
                  onChange={(v) => setReason(v as string)}
                  placeholder="Select a reason"
                  options={REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }))}
                />
              </FormField>
              <FormField label="Details (optional)" htmlFor="report-details">
                <Textarea
                  id="report-details"
                  fullWidth
                  rows={4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Anything that helps us review…"
                />
              </FormField>
              {!user ? <TurnstileWidget onToken={setToken} /> : null}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
