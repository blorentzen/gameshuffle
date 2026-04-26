"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Alert, Button, Container, FormField, Input, Select, Stack, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { DSAR_REQUEST_TYPE_LABELS } from "@/lib/email/dsar";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const REQUEST_TYPE_OPTIONS = Object.entries(DSAR_REQUEST_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface TurnstileAPI {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
}
function getTurnstile(): TurnstileAPI | undefined {
  return (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
}

export default function DataRequestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [requestType, setRequestType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Authenticated users get redirected to the in-account form for faster
  // processing. Pass a flag so the destination shows a one-time banner.
  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/account/privacy/data-request?from=public");
    }
  }, [user, loading, router]);

  // Render Turnstile once the script + ref are both ready.
  useEffect(() => {
    if (!turnstileReady || !turnstileRef.current || !TURNSTILE_SITE_KEY) return;
    if (widgetIdRef.current) return;

    const ts = getTurnstile();
    if (!ts) return;
    const id = ts.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
      theme: "light",
    });
    widgetIdRef.current = id;
  }, [turnstileReady]);

  const resetTurnstile = () => {
    const ts = getTurnstile();
    if (ts && widgetIdRef.current) {
      ts.reset(widgetIdRef.current);
      setCaptchaToken(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !requestType) {
      setError("Email and request type are required.");
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError("Please wait for the security check to complete.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dsar/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim(),
          request_type: requestType,
          description: description.trim() || null,
          turnstileToken: captchaToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        resetTurnstile();
        setSubmitting(false);
        return;
      }
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      resetTurnstile();
      setSubmitting(false);
    }
  };

  if (loading || user) {
    // Either still checking auth, or about to redirect — render nothing to
    // avoid a flash of the public form for logged-in users.
    return null;
  }

  return (
    <main className="dsar-page-main">
      <Container>
        <div className="dsar-page">
          <h1 className="dsar-page__title">Data Subject Access Request</h1>

          <Alert variant="info" className="dsar-page__notice">
            <strong>Already have a GameShuffle account?</strong>{" "}
            <a href="/login?redirect=/account/privacy/data-request">
              Sign in to submit your request faster
            </a>{" "}
            — we&apos;ll verify you immediately.
          </Alert>

          <p className="dsar-page__intro">
            Use this form to submit a privacy-related request. We&apos;ll respond within 30 days as required by applicable law. If you have an account, signing in is the fastest way — your identity is verified automatically.
          </p>

          {success ? (
            <Alert variant="success" title="Check your email">
              <p>
                We sent a verification link to <strong>{email}</strong>. Click the link within 7 days to confirm your request. We&apos;ll respond within 30 days.
              </p>
              <p className="dsar-page__success-note">
                If you don&apos;t see the email, check your spam folder. Still nothing? Email{" "}
                <a href="mailto:privacy@gameshuffle.co">privacy@gameshuffle.co</a> directly.
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

                <FormField label="Name (optional)">
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </FormField>

                <FormField label="Email address" required helperText="We'll send a verification link to this email address.">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </FormField>

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
                    placeholder="Provide any details that help us locate your data or process your request."
                    fullWidth
                  />
                </FormField>

                {TURNSTILE_SITE_KEY && (
                  <>
                    <Script
                      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                      strategy="afterInteractive"
                      onReady={() => setTurnstileReady(true)}
                    />
                    <div ref={turnstileRef} className="dsar-page__turnstile" />
                  </>
                )}

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting || (!!TURNSTILE_SITE_KEY && !captchaToken)}
                  >
                    {submitting ? "Submitting…" : "Send verification email"}
                  </Button>
                </div>

                <p className="dsar-page__footnote">
                  After submitting, check your email for a verification link. Your request is confirmed once you click the link. We&apos;ll respond within 30 days.
                </p>
              </Stack>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}
