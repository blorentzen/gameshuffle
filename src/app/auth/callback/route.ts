import { createClient } from "@/lib/supabase/server";
import { syncProfileFromOAuth } from "@/lib/auth/syncOAuthProfile";
import { PASSWORD_LATER_COOKIE } from "@/lib/auth/passwordNudge";
import { NextResponse } from "next/server";
import { offerGuestClaims } from "@/lib/tournaments/claims";
import { describeAuthError } from "@/lib/auth/errors";
import { reportAuthError } from "@/lib/auth/report";
import { safeRedirect } from "@/lib/auth/redirects";
import { hasPasswordFrom } from "@/lib/auth/passwordRules";

/**
 * Where a failed sign-in lands, with the reason attached (`?auth_error=`) for
 * AuthErrorNotice. Connecting an account from /account goes back there;
 * everything else goes to /login, keeping the original destination.
 */
function failureUrl(origin: string, redirect: string, code: string, explicit: boolean): string {
  // A reset link that didn't work: straight back to asking for a new one.
  if (redirect.startsWith("/reset-password")) {
    const u = new URL("/forgot-password", origin);
    u.searchParams.set("auth_error", code);
    return u.toString();
  }
  // Only an explicit /account destination (the Connect button) goes back there;
  // the default would bounce a signed-out person to /login and lose the reason.
  if (explicit && redirect.startsWith("/account")) {
    const u = new URL(redirect, origin);
    u.searchParams.set("auth_error", code);
    return u.toString();
  }
  const u = new URL("/login", origin);
  u.searchParams.set("auth_error", code);
  if (redirect !== "/account") u.searchParams.set("redirect", redirect);
  return u.toString();
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = safeRedirect(searchParams.get("redirect"));
  const explicitRedirect = searchParams.has("redirect");

  // Supabase sends provider and flow failures back here as error params
  // instead of a code. Keep the reason: log it, report it, show it.
  if (!code) {
    const friendly = describeAuthError({
      code: searchParams.get("error_code"),
      error: searchParams.get("error"),
      message: searchParams.get("error_description"),
    });
    console.error("[auth/callback] sign-in failed:", friendly.code, searchParams.get("error_description") ?? searchParams.get("error") ?? "(no code, no error)");
    reportAuthError(friendly, { surface: "callback", detail: searchParams.get("error_description") });
    return NextResponse.redirect(failureUrl(origin, redirect, friendly.code, explicitRedirect));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const friendly = describeAuthError({ code: error.code, message: error.message });
    console.error("[auth/callback] code exchange failed:", friendly.code, error.message);
    reportAuthError(friendly, { surface: "callback:exchange", detail: error.message });
    return NextResponse.redirect(failureUrl(origin, redirect, friendly.code, explicitRedirect));
  }
  // Sync OAuth profile data to public.users
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await syncProfileFromOAuth(supabase, user);

    // Guest entries saved under this (verified) address get offered, never
    // linked silently (spec F). Skipped when the user is already on their
    // way to a claim link, which offers the same entry itself.
    if (user.email && user.email_confirmed_at && !redirect.startsWith("/claim")) {
      await offerGuestClaims(user.id, user.email).catch((err) => console.error("[auth/callback] claim offer failed:", err));
    }

    // Per gs-connections-architecture.md §5 every account should have a
    // backup password. A Twitch/Discord-only account is offered one on
    // /signup/set-password (with `redirect` forwarded as `return_to`),
    // unless they chose "Not now" in the last 30 days (passwordNudge.ts).
    // A reset link is already on its way to setting a password, so don't ask twice.
    const hasPassword = hasPasswordFrom(user.app_metadata);
    const putOff = !!request.headers.get("cookie")?.split(/;\s*/).some((c) => c.startsWith(`${PASSWORD_LATER_COOKIE}=`));
    if (!hasPassword && !putOff && !redirect.startsWith("/reset-password")) {
      const setPasswordUrl = new URL("/signup/set-password", request.url);
      setPasswordUrl.searchParams.set("return_to", redirect);
      return NextResponse.redirect(setPasswordUrl);
    }
  }
  return NextResponse.redirect(`${origin}${redirect}`);
}
