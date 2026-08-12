"use client";

/**
 * Report an idea — reuses the existing T&S report flow (§6.2) via
 * /api/ideas/[id]/report (target_type 'idea'). Authed only; routes anon to login.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { REPORT_REASONS } from "@/lib/moderation/reasons";

const REASON_OPTIONS = REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }));

export function IdeaReportButton({ ideaId }: { ideaId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function trigger() {
    if (!user) {
      router.push(`/login?redirect=/ideas/${ideaId}`);
      return;
    }
    setOpen(true);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/ideas/${ideaId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details: details.trim() || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Couldn't submit the report. Please try again.");
      return;
    }
    setDone(true);
  }

  return (
    <>
      <button type="button" className="idea-report-trigger" onClick={trigger}>
        ⚐ Report
      </button>
      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title="Report this idea"
          size="small"
          footer={
            done ? (
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            ) : (
              <div className="ideas-submit__actions">
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
            <p>Thanks, our team will review this.</p>
          ) : (
            <div className="ideas-prompt">
              <Select
                floatingLabel="Reason"
                options={REASON_OPTIONS}
                value={reason}
                onChange={(v) => setReason(v as string)}
                fullWidth
              />
              <Textarea
                floatingLabel="Details (optional)"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                fullWidth
              />
              {error && <p className="ideas-submit__error">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
