/**
 * Plain-language auth errors. Supabase hands back error codes and developer
 * messages ("Unable to exchange external code", "Invalid login credentials");
 * this turns them into what happened and what to do next, and says which ones
 * we should hear about (`report`: our side or a provider failed, not a typo'd
 * password). Pure and client-safe; the callback route uses it too.
 */

export type AuthProvider = "twitch" | "discord" | "email";

export interface AuthErrorInput {
  /** Supabase's error code (AuthError.code, or `error_code` on a redirect). */
  code?: string | null;
  /** Supabase's message or `error_description`. */
  message?: string | null;
  /** The OAuth `error` param (access_denied, server_error…). */
  error?: string | null;
  provider?: string | null;
}

export interface FriendlyAuthError {
  /** A stable code for logs, Sentry and the ?auth_error= param. */
  code: string;
  message: string;
  /** True when it's our (or the provider's) failure, worth reporting. */
  report: boolean;
}

const PROVIDER_NAMES: Record<string, string> = { twitch: "Twitch", discord: "Discord", email: "email" };

export function providerName(p: string | null | undefined): string {
  return (p && PROVIDER_NAMES[p]) || "that account";
}

/** Normalizes whatever Supabase sent into one of our codes. */
export function authErrorCode(input: AuthErrorInput): string {
  const code = (input.code ?? "").toLowerCase();
  const msg = `${input.message ?? ""}`.toLowerCase();
  const err = (input.error ?? "").toLowerCase();
  if (code) return code;
  if (err === "access_denied" || /user denied|access denied|cancel/.test(msg)) return "access_denied";
  if (/exchange external code|invalid client secret|oauth2: cannot fetch token/.test(msg)) return "provider_exchange_failed";
  if (/error getting user email|email.*external provider|provider email/.test(msg)) return "provider_email_missing";
  if (/already linked|identity is already/.test(msg)) return "identity_already_exists";
  if (/already (been )?registered|user already exists/.test(msg)) return "user_already_exists";
  if (/invalid login credentials/.test(msg)) return "invalid_credentials";
  if (/email not confirmed/.test(msg)) return "email_not_confirmed";
  if (/rate limit|too many requests/.test(msg)) return "over_request_rate_limit";
  if (/captcha/.test(msg)) return "captcha_failed";
  if (/expired|invalid.*(link|token)|otp/.test(msg)) return "otp_expired";
  if (/provider is not enabled|unsupported provider/.test(msg)) return "provider_disabled";
  if (/database error saving new user/.test(msg)) return "unexpected_failure";
  if (/pwned|breach|leaked/.test(msg)) return "weak_password";
  if (/network|failed to fetch/.test(msg)) return "network_error";
  if (err === "server_error" || err === "temporarily_unavailable") return "unexpected_failure";
  return "unknown";
}

export function describeAuthError(input: AuthErrorInput): FriendlyAuthError {
  const code = authErrorCode(input);
  const who = providerName(input.provider);
  const withWho = input.provider && input.provider !== "email" ? ` with ${who}` : "";
  const m = (message: string, report = false): FriendlyAuthError => ({ code, message, report });
  switch (code) {
    case "access_denied":
      return m(`Signing in${withWho} was cancelled. Pick a way to sign in when you're ready.`);
    case "provider_exchange_failed":
    case "bad_oauth_callback":
    case "bad_oauth_state":
    case "flow_state_not_found":
    case "flow_state_expired":
    case "unexpected_failure":
    case "request_timeout":
      return m(`Signing in${withWho} didn't go through on our end. Try again in a minute, or use email instead. We've been told about it.`, true);
    case "pkce_code_verifier_not_found":
    case "bad_code_verifier":
      return m("That link has to be opened in the same browser you started in. Open it there, or sign in again here.");
    case "provider_email_missing":
    case "provider_email_needs_verification":
      return m(`${who === "that account" ? "That account" : who} didn't share a verified email with us. Verify your email with ${who}, or sign up with email instead.`);
    case "identity_already_exists":
      return m(`That ${who} account is already connected to a different GameShuffle account. Sign in with that account, or disconnect it there first.`);
    case "user_already_exists":
    case "email_exists":
      return m("An account already uses that email. Sign in with your password, then connect Twitch or Discord from your account's Connections.");
    case "invalid_credentials":
      return m("That email and password don't match. Check them, or reset your password.");
    case "email_not_confirmed":
      return m("Confirm your email first: check your inbox for the link we sent.");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return m("Too many tries in a short time. Wait a minute, then try again.");
    case "captcha_failed":
      return m("The security check didn't go through. Refresh the page and try again.");
    case "otp_expired":
      return m("That link has expired or was already used. Request a new one and use the newest email.");
    case "provider_disabled":
    case "oauth_provider_not_supported":
      return m(`Signing in${withWho} is switched off right now. Use email for the moment.`, true);
    case "signup_disabled":
      return m("New sign-ups are paused right now. Try again soon.", true);
    case "weak_password":
      return m("Choose a stronger password. That one is too easy to guess or has shown up in a data breach.");
    case "same_password":
      return m("Your new password has to be different from your current one.");
    case "email_address_invalid":
      return m("That email address doesn't look right. Check it and try again.");
    case "user_banned":
      return m("This account is suspended. Check your email for details, or contact support@gameshuffle.co.");
    case "network_error":
      return m("We couldn't reach the sign-in service. Check your connection and try again.");
    case "manual_linking_disabled":
      return m("Connecting accounts is switched off right now. Try again soon.", true);
    default:
      return m(`Something went wrong signing you in${withWho}. Try again, or use a different way to sign in.`, true);
  }
}
