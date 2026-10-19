"use client";

/**
 * Reusable Cloudflare Turnstile widget (explicit-render mode). Calls
 * `onToken` with the solved token (or null on expiry/error). Renders
 * nothing when no site key is configured. Extracted from the contact form
 * so report/abuse forms can reuse it; login and sign-up use it too.
 *
 * If Cloudflare's script is blocked (a content blocker, a strict network) or
 * hasn't loaded after 12 seconds, it says so instead of leaving an empty gap,
 * since the form can't be sent without a token.
 */

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

interface TurnstileAPI {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
}
function getTurnstile(): TurnstileAPI | undefined {
  return (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
}

export function TurnstileWidget({
  onToken,
  theme = "light",
  size = "normal",
  resetKey,
  center = false,
}: {
  onToken: (token: string | null) => void;
  theme?: "light" | "dark";
  /** Change it to get a fresh challenge (a token works once, so forms that can be sent again bump this after each try). */
  resetKey?: number;
  /** "flexible" fills the container width (min 300px) — use in narrow columns
   *  like the tournament sign-up rail so the widget doesn't overflow. */
  size?: "normal" | "flexible" | "compact";
  /** Centre the widget in its column (login and sign-up). */
  center?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Still nothing after 12 seconds: say so (cleared if it loads after all).
  useEffect(() => {
    if (ready || !TURNSTILE_SITE_KEY) return;
    const t = window.setTimeout(() => setFailed(true), 12000);
    return () => window.clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    if (!ready || !ref.current || !TURNSTILE_SITE_KEY || widgetIdRef.current) return;
    const ts = getTurnstile();
    // Loaded but not usable (a blocker can stub the script): same message.
    if (!ts) { setFailed(true); return; }
    setFailed(false);
    widgetIdRef.current = ts.render(ref.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
      theme,
      size,
    });
    // onToken/theme are stable for our callers; render once when ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (resetKey === undefined || !widgetIdRef.current) return;
    getTurnstile()?.reset(widgetIdRef.current);
    onToken(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div ref={ref} style={{ maxWidth: "100%", overflow: "hidden", ...(center ? { display: "flex", justifyContent: "center" } : {}) }} />
      {failed && (
        <p role="status" style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-secondary)", textAlign: center ? "center" : undefined }}>
          The security check didn&apos;t load. Turn off any content blocker for this page, or reload it.
        </p>
      )}
    </>
  );
}
