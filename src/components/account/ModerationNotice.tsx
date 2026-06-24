"use client";

/**
 * Shown at the top of /account when the signed-in user is suspended or
 * banned: explains the restriction and offers a one-time appeal. Renders
 * nothing for users in good standing.
 */

import { useEffect, useState } from "react";
import { Alert, Button, Textarea } from "@empac/cascadeds";

export function ModerationNotice() {
  const [status, setStatus] = useState("ok");
  const [until, setUntil] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [hasAppeal, setHasAppeal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/appeal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) {
          setStatus(b.moderationStatus);
          setUntil(b.moderationUntil);
          setReason(b.moderationReason);
          setHasAppeal(b.hasOpenAppeal);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || (status !== "suspended" && status !== "banned")) return null;

  async function submit() {
    setError(null);
    if (message.trim().length < 10) {
      setError("Please add a short explanation (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        setError("Couldn't submit your appeal. Please try again.");
        return;
      }
      setSubmitted(true);
      setHasAppeal(true);
    } finally {
      setSubmitting(false);
    }
  }

  const headline =
    status === "banned"
      ? "Your account has been banned."
      : `Your account is suspended${until ? ` until ${new Date(until).toLocaleString()}` : ""}.`;

  return (
    <div className="account-card">
      <Alert variant="warning" title="Account restricted">
        <p style={{ margin: 0 }}>
          {headline}
          {reason ? ` Reason: ${reason}` : ""}
        </p>
      </Alert>

      {submitted || hasAppeal ? (
        <p style={{ marginTop: "var(--spacing-12)", color: "var(--text-secondary)" }}>
          Your appeal has been submitted — our team will review it.
        </p>
      ) : (
        <div style={{ marginTop: "var(--spacing-16)", display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <Textarea
            fullWidth
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Appeal this decision — tell us why…"
          />
          <div>
            <Button variant="primary" loading={submitting} onClick={() => void submit()}>
              Submit appeal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
