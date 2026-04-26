"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card, Checkbox, FormField, Select, Stack, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { DSAR_REQUEST_TYPE_LABELS } from "@/lib/email/dsar";

const REQUEST_TYPE_OPTIONS = Object.entries(DSAR_REQUEST_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function AccountDataRequestPage() {
  return (
    <Suspense>
      <AuthenticatedDataRequest />
    </Suspense>
  );
}

function AuthenticatedDataRequest() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const cameFromPublic = searchParams.get("from") === "public";

  const [requestType, setRequestType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    (typeof meta?.display_name === "string" && meta.display_name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!requestType) {
      setError("Please select a request type.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm this request relates to your own account.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dsar/submit-authenticated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_type: requestType,
          description: description.trim() || null,
          confirmed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) return <p className="dsar-page__muted">Loading…</p>;
  if (!user) {
    // Middleware should have redirected, but render a fallback just in case.
    return (
      <p className="dsar-page__muted">
        Please <a href="/login?redirect=/account/privacy/data-request">sign in</a> to submit a privacy request.
      </p>
    );
  }

  return (
    <div className="dsar-page">
      <p className="dsar-page__back">
        <a href="/account">← Back to account</a>
      </p>

      <h1 className="dsar-page__title">Submit a Privacy Request</h1>
      <p className="dsar-page__intro">
        We&apos;ve pre-filled your account information. Submit this form to request data access, correction, deletion, or to opt out of marketing communications. We&apos;ll respond within 30 days.
      </p>

      {cameFromPublic && (
        <Alert variant="info" className="dsar-page__notice">
          We&apos;ve redirected you to the authenticated version of this form for faster processing.
        </Alert>
      )}

      {success ? (
        <Alert variant="success" title="Request submitted">
          <p>
            Thanks — we&apos;ve received your privacy request and sent a confirmation email to <strong>{user.email}</strong>. We&apos;ll respond within 30 days.
          </p>
          <p className="dsar-page__success-note">
            For account deletion specifically, you can also use the self-service deletion option under{" "}
            <a href="/account?tab=security">Security</a>.
          </p>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit}>
          <Stack direction="vertical" gap={16}>
            {error && (
              <Alert variant="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Card variant="flat" padding="medium" className="dsar-page__identity">
              <p><strong>Name:</strong> {displayName || "(not set)"}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p className="dsar-page__identity-note">Identity verified by your active session.</p>
            </Card>

            <FormField label="Type of request" required>
              <Select
                options={REQUEST_TYPE_OPTIONS}
                value={requestType}
                onChange={(v) => setRequestType(typeof v === "string" ? v : v[0] ?? "")}
                placeholder="Select a request type…"
                fullWidth
              />
            </FormField>

            <FormField
              label="Description (optional)"
              helperText={`${description.length}/1000 characters`}
            >
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                rows={5}
                maxLength={1000}
                placeholder="Provide any details that help us process your request."
                fullWidth
              />
            </FormField>

            <Checkbox
              label="I confirm this request relates to my own GameShuffle account."
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />

            <div>
              <Button type="submit" variant="primary" disabled={submitting || !confirmed}>
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </div>

            <p className="dsar-page__footnote">
              Submitting this form sends a confirmation to your account email and notifies the GameShuffle privacy team. We&apos;ll respond within 30 days. For account deletion specifically, you can also use the self-service deletion option under{" "}
              <a href="/account?tab=security">Security</a>.
            </p>
          </Stack>
        </form>
      )}
    </div>
  );
}
