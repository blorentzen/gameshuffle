import * as Sentry from "@sentry/nextjs";
import type { FriendlyAuthError } from "@/lib/auth/errors";

/**
 * Sends an auth failure to Sentry, tagged so they group by code and provider.
 * Only failures on our (or the provider's) side are reported; a typo'd
 * password or a cancelled sign-in isn't worth an alert. Works server and client.
 */
export function reportAuthError(e: FriendlyAuthError, ctx: { provider?: string | null; surface: string; detail?: string | null }): void {
  if (!e.report) return;
  try {
    Sentry.captureMessage(`Auth failed: ${e.code}`, {
      level: "error",
      tags: { area: "auth", auth_code: e.code, auth_provider: ctx.provider ?? "unknown", auth_surface: ctx.surface },
      extra: ctx.detail ? { detail: ctx.detail.slice(0, 500) } : undefined,
    });
  } catch {
    /* reporting must never break sign-in */
  }
}
