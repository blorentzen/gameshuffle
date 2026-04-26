/**
 * Cloudflare Turnstile server-side token verification.
 *
 * Pairs with the Turnstile widget on the client. The widget yields a token
 * that must be verified server-side via siteverify before we trust it.
 *
 * Local-dev fallback: if `TURNSTILE_SECRET_KEY` is unset, verification
 * short-circuits to `true` so dev still works without provisioning the key.
 * In any environment with the secret set, real verification runs.
 */

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
    // Dev / preview environments without a secret configured — accept the token.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (dev only)");
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
