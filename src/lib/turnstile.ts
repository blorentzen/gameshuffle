/**
 * Cloudflare Turnstile server-side token verification.
 *
 * Pairs with the Turnstile widget on the client. The widget yields a token
 * that must be verified server-side via siteverify before we trust it.
 *
 * Non-production fallback: if `TURNSTILE_SECRET_KEY` is unset AND we are not
 * on the production deployment (`isProduction`), verification short-circuits
 * to `true` so preview/dev/local work without provisioning the key. Any
 * environment WITH the secret set runs real verification (so a dev domain
 * added to the widget's hostnames is still protected). Production always
 * requires the secret.
 */

import { isProduction } from "@/lib/env";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function verifyTurnstileToken(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    // Preview / dev / local without a secret configured — accept the token.
    // Keyed on the deployment environment (NODE_ENV is "production" on Vercel
    // previews too, so it can't be used for this).
    if (!isProduction) {
      console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (non-production)");
      return true;
    }
    console.error("[turnstile] TURNSTILE_SECRET_KEY missing in production");
    return false;
  }

  if (!token) return false;

  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const data = (await res.json()) as TurnstileVerifyResponse;
    if (!data.success) {
      console.warn("[turnstile] verification failed:", data["error-codes"]);
    }
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] verification request error:", err);
    return false;
  }
}
