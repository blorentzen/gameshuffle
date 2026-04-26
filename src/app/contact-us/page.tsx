"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  Alert,
  Button,
  Card,
  Container,
  FormField,
  Input,
  Select,
  Stack,
  Textarea,
} from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { useAuth } from "@/components/auth/AuthProvider";
import { CONTACT_TOPIC_LABELS } from "@/lib/email/contact";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const TOPIC_OPTIONS = Object.entries(CONTACT_TOPIC_LABELS).map(([value, label]) => ({
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

export default function ContactPage() {
  const { user } = useAuth();

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const prefilledName =
    (typeof meta?.display_name === "string" && meta.display_name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    "";
  const prefilledEmail = user?.email ?? "";

  const [name, setName] = useState(prefilledName);
  const [email, setEmail] = useState(prefilledEmail);
  const [topic, setTopic] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // If the user logs in/out after the page loads, sync the prefill.
  useEffect(() => {
    if (prefilledName && !name) setName(prefilledName);
    if (prefilledEmail && !email) setEmail(prefilledEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledName, prefilledEmail]);

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

    if (!email) {
      setError("Email is required.");
      return;
    }
    if (!topic) {
      setError("Please select a topic.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Please include a short message (at least 10 characters).");
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError("Please wait for the security check to complete.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim(),
          topic,
          message: message.trim(),
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

  return (
    <>
      <VideoHero
        backgroundImage="/images/bg/MK8DX_Background_Music.jpg"
        overlayOpacity={0.8}
        height="medium"
      >
        <Container>
          <div className="contact-hero">
            <p className="contact-hero__eyebrow">Contact</p>
            <h1 className="contact-hero__title">Get in touch</h1>
            <p className="contact-hero__subline">
              Have a feature idea, found a bug, or need help with your account?
              Send us a note and we&apos;ll get back to you within 1–2 business days.
            </p>
          </div>
        </Container>
      </VideoHero>

      <main className="contact-page-main">
        <Container>
          <div className="contact-page">
            <div className="contact-page__layout">
              <div className="contact-page__intro">
                <Card variant="flat" padding="medium" className="contact-page__channels">
                  <p className="contact-page__channels-label">Other ways to reach us</p>
                  <ul className="contact-page__channels-list">
                    <li><strong>Support:</strong> <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a></li>
                    <li><strong>Privacy:</strong> <a href="mailto:privacy@gameshuffle.co">privacy@gameshuffle.co</a></li>
                    <li><strong>Legal:</strong> <a href="mailto:legal@gameshuffle.co">legal@gameshuffle.co</a></li>
                    <li><strong>Billing:</strong> <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a></li>
                  </ul>
                  <p className="contact-page__channels-note">
                    For privacy or data requests, the <a href="/data-request">Data Request Form</a> is the fastest path.
                  </p>
                </Card>
              </div>

              <Card variant="elevated" padding="large" className="contact-page__form-card">
                {success ? (
                  <Alert variant="success" title="Message sent">
                    <p>
                      Thanks{prefilledName || name ? `, ${(prefilledName || name).split(" ")[0]}` : ""} — we&apos;ve received your message and sent a confirmation to <strong>{email}</strong>.
                    </p>
                    <p className="contact-page__success-note">
                      We typically respond within 1–2 business days. If you don&apos;t see our reply, check your spam folder.
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

                      <FormField label="Email" required>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          placeholder="you@example.com"
                        />
                      </FormField>

                      <FormField label="Topic" required>
                        <Select
                          options={TOPIC_OPTIONS}
                          value={topic}
                          onChange={(v) => setTopic(typeof v === "string" ? v : v[0] ?? "")}
                          placeholder="Select a topic…"
                          fullWidth
                        />
                      </FormField>

                      <FormField
                        label="Message"
                        required
                        helperText={`${message.length}/5000 characters`}
                      >
                        <Textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                          rows={6}
                          maxLength={5000}
                          placeholder="What can we help with?"
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
                          <div ref={turnstileRef} className="contact-page__turnstile" />
                        </>
                      )}

                      <div>
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={submitting || (!!TURNSTILE_SITE_KEY && !captchaToken)}
                        >
                          {submitting ? "Sending…" : "Send message"}
                        </Button>
                      </div>

                      <p className="contact-page__footnote">
                        By sending this message you agree to our <a href="/privacy">Privacy Policy</a>. We&apos;ll only use your email to respond to your request.
                      </p>
                    </Stack>
                  </form>
                )}
              </Card>
            </div>
          </div>
        </Container>
      </main>
    </>
  );
}
