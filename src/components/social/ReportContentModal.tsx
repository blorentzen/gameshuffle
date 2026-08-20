"use client";

/** Minimal report dialog for a feed post/comment — files into the T&S queue. */

import { useState } from "react";
import { Modal, Select, Textarea, Button } from "@empac/cascadeds";
import { REPORT_REASONS } from "@/lib/moderation/reasons";
import { useToast } from "@/components/toast/ToastProvider";

const REASON_OPTIONS = REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }));

export function ReportContentModal({
  targetType,
  targetId,
  open,
  onClose,
}: {
  targetType: "post" | "comment";
  targetId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]?.id ?? "");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      const res = await fetch("/api/social/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, details: details || null }),
      });
      if (res.ok) {
        toast.success("Report submitted. Thanks, our team will review it.");
        onClose();
        setDetails("");
      } else {
        toast.error("Could not submit report.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={`Report ${targetType}`} size="small">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
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
        />
        <div style={{ display: "flex", gap: "var(--spacing-8)", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => void submit()} disabled={busy || !reason}>
            Submit report
          </Button>
        </div>
      </div>
    </Modal>
  );
}
