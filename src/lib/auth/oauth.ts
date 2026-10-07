"use client";

import { createClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/lib/auth/errors";
import { reportAuthError } from "@/lib/auth/report";
import { EVENTS, track } from "@/lib/analytics/events";

/**
 * Starts a Twitch or Discord sign-in (or, with `link`, connects it to the
 * signed-in account). Every button uses this so a failure to even start shows
 * a plain message instead of nothing, and so the error page after a failed
 * round trip knows which provider was tried (sessionStorage, not the return
 * URL: Supabase only honours return URLs on its allowlist, and a change there
 * would silently send people to the homepage).
 *
 * Returns null once the browser is on its way to the provider, or a friendly
 * error message to show.
 */

const ATTEMPT_KEY = "gs-oauth-attempt";

export type OAuthProvider = "twitch" | "discord";

export function rememberAttempt(provider: OAuthProvider, surface: string): void {
  try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ provider, surface, at: Date.now() })); } catch { /* optional */ }
}

/** The provider last tried in this tab, if within the last 15 minutes. */
export function lastAttempt(): { provider: OAuthProvider; surface: string } | null {
  try {
    const a = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null") as { provider: OAuthProvider; surface: string; at: number } | null;
    return a && Date.now() - a.at < 15 * 60 * 1000 ? { provider: a.provider, surface: a.surface } : null;
  } catch {
    return null;
  }
}

export async function startOAuth(provider: OAuthProvider, redirectTo: string, opts: { link?: boolean; surface: string }): Promise<string | null> {
  rememberAttempt(provider, opts.surface);
  try {
    const supabase = createClient();
    if (opts.link) {
      const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo } });
      if (error) throw error;
      if (data?.url) {
        track(EVENTS.accountLinked, { provider });
        window.location.assign(data.url);
      }
      return null;
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
    return null;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const friendly = describeAuthError({ code: e?.code, message: e?.message, provider });
    reportAuthError(friendly, { provider, surface: `${opts.surface}:start`, detail: e?.message });
    return friendly.message;
  }
}
