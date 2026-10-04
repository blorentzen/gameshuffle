"use client";

/**
 * Shows why a sign-in failed after a round trip through Twitch, Discord or an
 * email link. Reads `?auth_error=` (set by /auth/callback) plus the raw
 * `error` / `error_code` / `error_description` Supabase can put in the query or
 * after the `#`, turns it into plain language, reports it once, then tidies the
 * address bar so a refresh doesn't show it again.
 */

import { useEffect, useState } from "react";
import { Alert } from "@empac/cascadeds";
import { describeAuthError, type FriendlyAuthError } from "@/lib/auth/errors";
import { reportAuthError } from "@/lib/auth/report";
import { lastAttempt } from "@/lib/auth/oauth";

const PARAMS = ["auth_error", "error", "error_code", "error_description"];

export function readAuthErrorFromUrl(): { code: string | null; error: string | null; message: string | null } | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const get = (k: string) => q.get(k) ?? h.get(k);
  const code = get("auth_error") ?? get("error_code");
  const error = get("error");
  const message = get("error_description");
  // Our own old param (?error=auth) carried no reason.
  if (!code && !message && (!error || error === "auth")) return error === "auth" ? { code: "unknown", error: null, message: null } : null;
  return { code, error, message };
}

export function AuthErrorNotice({ surface }: { surface: string }) {
  const [shown, setShown] = useState<FriendlyAuthError | null>(null);

  useEffect(() => {
    const raw = readAuthErrorFromUrl();
    if (!raw) return;
    const attempt = lastAttempt();
    const friendly = describeAuthError({ ...raw, provider: attempt?.provider });
    // Server-side failures were already reported by /auth/callback; only report here what it couldn't see (errors after the #).
    const fromCallback = new URLSearchParams(window.location.search).has("auth_error");
    if (!fromCallback) reportAuthError(friendly, { provider: attempt?.provider, surface, detail: raw.message });
    void Promise.resolve().then(() => setShown(friendly));
    const url = new URL(window.location.href);
    PARAMS.forEach((p) => url.searchParams.delete(p));
    if (/error/.test(url.hash)) url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [surface]);

  if (!shown) return null;
  return (
    <div style={{ marginBottom: "var(--spacing-16)" }}>
      <Alert variant="error" title="That didn't work">{shown.message}</Alert>
    </div>
  );
}
