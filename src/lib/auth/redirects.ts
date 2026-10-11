/**
 * Where a sign-in may send someone afterwards: the `?redirect=` param on
 * /auth/callback and the `next` on /auth/confirm. Restricted to known paths
 * so a crafted link can't bounce a freshly signed-in person to a forged
 * in-product page; anything absolute or protocol-relative is refused.
 */

/**
 * Allowlist for the `?redirect=` param. Phase B introduced live-view
 * sign-in flows that pass `redirect=/live/[slug]`, which expanded the
 * surface area for path-based open-redirect attacks. Restricting to
 * known-good prefixes keeps the existing flows working while preventing
 * a malicious URL from bouncing users to a forged in-product path.
 *
 * External redirects (e.g. https://evil.com) were already prevented by
 * the `${origin}${redirect}` concatenation; this allowlist guards the
 * remaining path-based vectors.
 */
export const ALLOWED_REDIRECT_PREFIXES = [
  "/account",
  "/hub",
  "/live/",
  "/signup",
  "/reset-password",
  "/randomizers/",
  "/competitive/",
  "/tournament",
  "/claim",
  "/party",
  // Mod invites send people back to their invite after signing in; without
  // this they were dropped on /account instead.
  "/mod/invite/",
  // A Twitch mod joining from `!gs mod` (sign in with Twitch, then join).
  "/mod/join/",
  // Signing up from the Discord Activity: its join page (signing in first to
  // connect Discord) and the "head back to Discord" page it ends on.
  "/discord/join",
  "/discord/joined",
  // "Add to Discord" on /discord: sign up, then straight into the bot install.
  "/discord/add",
];

export function safeRedirect(raw: string | null, fallback = "/account"): string {
  if (!raw) return fallback;
  // Reject anything that looks like an absolute URL or protocol-relative.
  if (raw.startsWith("//") || raw.includes("://")) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // Allow exact matches or matches with a path suffix on the prefix.
  for (const prefix of ALLOWED_REDIRECT_PREFIXES) {
    if (raw === prefix) return raw;
    if (prefix.endsWith("/") && raw.startsWith(prefix)) return raw;
    if (!prefix.endsWith("/") && (raw === prefix || raw.startsWith(`${prefix}/`) || raw.startsWith(`${prefix}?`))) {
      return raw;
    }
  }
  return fallback;
}

