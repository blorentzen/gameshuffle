"use client";

/**
 * Reusable Cloudflare Turnstile widget (explicit-render mode). Calls
 * `onToken` with the solved token (or null on expiry/error). Renders
 * nothing when no site key is configured. Extracted from the contact form
 * so report/abuse forms can reuse it.
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
}: {
  onToken: (token: string | null) => void;
  theme?: "light" | "dark";
}) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !ref.current || !TURNSTILE_SITE_KEY || widgetIdRef.current) return;
    const ts = getTurnstile();
    if (!ts) return;
    widgetIdRef.current = ts.render(ref.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
      theme,
    });
    // onToken/theme are stable for our callers; render once when ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={ref} />
    </>
  );
}
