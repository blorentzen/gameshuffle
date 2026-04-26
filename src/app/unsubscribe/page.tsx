"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Container, Stack } from "@empac/cascadeds";
import { EMAIL_CATEGORY_LABELS, type EmailCategory } from "@/lib/email/subscription-categories";

const CATEGORY_PARAM_VALUES: EmailCategory[] = ["product_updates", "tips_and_guides", "partner_offers"];

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const rawCategory = searchParams.get("category");
  const category =
    rawCategory && CATEGORY_PARAM_VALUES.includes(rawCategory as EmailCategory)
      ? (rawCategory as EmailCategory)
      : null;

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // Auto-submit on page load — recipient already clicked the link in their
  // email, no second click required (one-click unsubscribe per CAN-SPAM).
  useEffect(() => {
    if (!token || status !== "idle") return;
    setStatus("loading");
    fetch("/api/email/subscriptions/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...(category ? { category } : {}) }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "We couldn't process the unsubscribe.");
          setStatus("error");
          return;
        }
        setEmail(data.email ?? null);
        setStatus("success");
      })
      .catch((err) => {
        console.error(err);
        setError("Network error. Please try again.");
        setStatus("error");
      });
  }, [token, category, status]);

  return (
    <main style={{ paddingTop: "var(--spacing-32)", paddingBottom: "var(--spacing-48)" }}>
      <Container>
        <div style={{ maxWidth: "56rem", margin: "0 auto" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-32)", fontWeight: 600, marginBottom: "var(--spacing-16)" }}>
            Email preferences
          </h1>

          <Stack direction="vertical" gap={16}>
            {!token && (
              <Alert variant="error" title="Missing unsubscribe link">
                <p>This page expects an unsubscribe token. If you arrived here from an email, try clicking the link directly.</p>
              </Alert>
            )}

            {status === "loading" && <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Updating your preferences…</p>}

            {status === "success" && (
              <Alert variant="success" title={category ? `Unsubscribed from ${EMAIL_CATEGORY_LABELS[category]}` : "Unsubscribed from all marketing emails"}>
                <p>
                  {email ? <>The email address <strong>{email}</strong> has been removed from </> : "You've been removed from "}
                  {category ? <>our <strong>{EMAIL_CATEGORY_LABELS[category]}</strong> mailing list.</> : "all GameShuffle marketing emails."}
                  {" "}You&apos;ll still receive transactional emails (receipts, password resets, account changes) — those are required to operate the service.
                </p>
                <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
                  Changed your mind? You can manage all your email preferences from your{" "}
                  <a href="/account?tab=security" style={{ color: "var(--primary-600)" }}>account settings</a>.
                </p>
              </Alert>
            )}

            {status === "error" && (
              <Alert variant="error" title="Unsubscribe failed">
                <p>{error}</p>
                <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
                  If this keeps happening, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll handle it directly.
                </p>
                <div style={{ marginTop: "var(--spacing-12)" }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStatus("idle");
                      setError(null);
                    }}
                  >
                    Try again
                  </Button>
                </div>
              </Alert>
            )}
          </Stack>
        </div>
      </Container>
    </main>
  );
}
