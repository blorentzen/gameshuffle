"use client";

/**
 * BetaInterestForm — the /beta application form.
 *
 * Account-first: applicants must be signed in so the application ties to a real
 * user and we can grant Pro when accepted. Signed out => a create-account gate.
 * Signed in => the form (email comes from the account; the server uses it).
 * Turnstile-gated, mirroring the contact form's explicit render + reset.
 */

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { Alert, Button, FormField, Input, Select, Stack, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const PLATFORM_OPTIONS = [
  { value: "twitch", label: "Twitch" },
  { value: "youtube", label: "YouTube" },
  { value: "kick", label: "Kick" },
  { value: "other", label: "Other / multiple" },
];

const SIZE_OPTIONS = [
  { value: "starting", label: "Just getting started" },
  { value: "under_100", label: "Under 100 avg viewers" },
  { value: "100_500", label: "100 to 500 avg viewers" },
  { value: "500_2k", label: "500 to 2,000 avg viewers" },
  { value: "over_2k", label: "2,000+ avg viewers" },
];

interface TurnstileAPI {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
}
function getTurnstile(): TurnstileAPI | undefined {
  return (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
}

export function BetaInterestForm() {
  const { user, loading } = useAuth();

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const prefilledName =
    (typeof meta?.display_name === "string" && meta.display_name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    "";

  const [name, setName] = useState(prefilledName);
  const [platform, setPlatform] = useState("twitch");
  const [channelUrl, setChannelUrl] = useState("");
  const [communitySize, setCommunitySize] = useState("starting");
  const [about, setAbout] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const signedIn = !!user;

  useEffect(() => {
    if (prefilledName && !name) setName(prefilledName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledName]);

  useEffect(() => {
    // Only mount the widget once the signed-in form is actually on screen.
    if (!signedIn || success) return;
    if (!turnstileReady || !turnstileRef.current || !TURNSTILE_SITE_KEY) return;
    if (widgetIdRef.current) return;
    const ts = getTurnstile();
    if (!ts) return;
    widgetIdRef.current = ts.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
      theme: "light",
    });
  }, [turnstileReady, signedIn, success]);

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
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError("Please wait for the security check to complete.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/beta/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          platform,
          channelUrl: channelUrl.trim() || null,
          communitySize,
          about: about.trim() || null,
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

  // --- Loading -------------------------------------------------------------
  if (loading) {
    return (
      <div className="beta-panel">
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  // --- Success -------------------------------------------------------------
  if (success) {
    return (
      <div className="beta-panel">
        <Alert variant="success" title="You're on the list">
          <p>
            Thanks{name ? `, ${name.split(" ")[0]}` : ""}. We&apos;ve received your application and
            sent a confirmation to <strong>{user?.email}</strong>.
          </p>
          <p style={{ marginTop: "var(--spacing-8)" }}>
            We review applications regularly. If you&apos;re a fit, we&apos;ll reach out with your
            invite and switch on Pro for the beta.
          </p>
        </Alert>
      </div>
    );
  }

  // --- Account-first gate (signed out) ------------------------------------
  if (!signedIn) {
    return (
      <div className="beta-panel beta-gate">
        <span className="beta-gate__step">Step 1</span>
        <h3 className="beta-gate__title">Create your account first</h3>
        <p className="beta-gate__body">
          The beta is tied to your GameShuffle account. It takes a minute, and it&rsquo;s how we
          switch on Pro and get you set up the moment you&rsquo;re accepted. Come right back here to
          apply.
        </p>
        <Stack direction="horizontal" gap={12} wrap>
          <Link href="/signup?redirect=/beta" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="large">
              Create your account
            </Button>
          </Link>
          <Link href="/login?redirect=/beta" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="large">
              Log in
            </Button>
          </Link>
        </Stack>
      </div>
    );
  }

  // --- Signed-in application form -----------------------------------------
  return (
    <div className="beta-panel">
      <form onSubmit={handleSubmit}>
        <Stack direction="vertical" gap={16}>
          {error && (
            <Alert variant="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <p className="beta-form__aswho">
            Applying as <strong>{user?.email}</strong>
          </p>

          <FormField label="Name or channel name (optional)">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How your community knows you"
            />
          </FormField>

          <FormField label="Where do you stream?" required>
            <Select
              options={PLATFORM_OPTIONS}
              value={platform}
              onChange={(v) => setPlatform(typeof v === "string" ? v : v[0] ?? "twitch")}
              fullWidth
            />
          </FormField>

          <FormField label="Channel link or handle" helperText="So we can check out your stream.">
            <Input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="twitch.tv/yourchannel"
            />
          </FormField>

          <FormField label="Community size">
            <Select
              options={SIZE_OPTIONS}
              value={communitySize}
              onChange={(v) => setCommunitySize(typeof v === "string" ? v : v[0] ?? "starting")}
              fullWidth
            />
          </FormField>

          <FormField
            label="What do you stream, and what are you most excited to try?"
            helperText={`${about.length}/3000 characters`}
          >
            <Textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, 3000))}
              rows={5}
              maxLength={3000}
              placeholder="Mario Kart game nights with my community, would love to run tournaments and let chat reroll my kart…"
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
              <div ref={turnstileRef} className="beta-form__turnstile" />
            </>
          )}

          <div>
            <Button
              type="submit"
              variant="primary"
              size="large"
              disabled={submitting || (!!TURNSTILE_SITE_KEY && !captchaToken)}
            >
              {submitting ? "Sending…" : "Request an invite"}
            </Button>
          </div>

          <p className="beta-form__footnote">
            By applying you agree to our <a href="/privacy">Privacy Policy</a> and to sharing
            feedback during the beta. We&apos;ll only use your email to review your application and
            send your invite.
          </p>
        </Stack>
      </form>
    </div>
  );
}
