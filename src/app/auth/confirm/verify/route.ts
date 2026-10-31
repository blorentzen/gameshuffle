/**
 * POST /auth/confirm/verify: the button on /auth/confirm. Verifies the email
 * link's token hash with Supabase (which signs the person in on this device),
 * then sends them on: a reset to /reset-password, everything else to where
 * the link was headed (`next`, allowlisted) or their account.
 *
 * `next` may be a path or the full URL Supabase was given as redirectTo
 * (https://www.gameshuffle.co/auth/callback?redirect=/live/sam); for the
 * latter the inner `redirect` is used. A failure goes to /forgot-password
 * (resets) or /login with the reason (?auth_error=) for AuthErrorNotice.
 */

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { describeAuthError } from "@/lib/auth/errors";
import { reportAuthError } from "@/lib/auth/report";
import { safeRedirect } from "@/lib/auth/redirects";
import { offerGuestClaims } from "@/lib/tournaments/claims";

export const runtime = "nodejs";

const TYPES = new Set<EmailOtpType>(["recovery", "signup", "email", "magiclink", "invite", "email_change"]);

/** A path from `next`, whether it came as a path or as the full redirectTo URL. */
function nextPath(raw: string, origin: string, fallback: string): string {
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//")) return safeRedirect(raw, fallback);
  try {
    const url = new URL(raw);
    const ours = url.origin === origin || /(^|\.)gameshuffle\.co$/.test(url.hostname) || url.hostname === "localhost";
    if (!ours) return fallback;
    if (url.pathname === "/auth/callback") return safeRedirect(url.searchParams.get("redirect"), fallback);
    return safeRedirect(url.pathname + url.search, fallback);
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = String(form?.get("type") ?? "") as EmailOtpType;
  const recovery = type === "recovery";
  const next = recovery ? "/reset-password" : nextPath(String(form?.get("next") ?? ""), origin, "/account");

  const fail = (code: string) => {
    const u = new URL(recovery ? "/forgot-password" : "/login", origin);
    u.searchParams.set("auth_error", code);
    if (!recovery && next !== "/account") u.searchParams.set("redirect", next);
    return NextResponse.redirect(u, 303);
  };

  if (!tokenHash || tokenHash.length > 200 || !TYPES.has(type)) return fail("otp_expired");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    const friendly = describeAuthError({ code: error.code, message: error.message, provider: "email" });
    console.error("[auth/confirm] verify failed:", friendly.code, error.message);
    reportAuthError(friendly, { surface: `confirm:${type}`, detail: error.message });
    return fail(friendly.code);
  }

  // Same as the callback: guest entries under a now-confirmed address are offered, never linked silently.
  const user = data.user;
  if (user?.email && user.email_confirmed_at && !next.startsWith("/claim") && !recovery) {
    await offerGuestClaims(user.id, user.email).catch((err) => console.error("[auth/confirm] claim offer failed:", err));
  }
  return NextResponse.redirect(new URL(next, origin), 303);
}
