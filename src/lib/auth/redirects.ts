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
  // New accounts land on the welcome page (sign-up's default return).
  "/welcome",
  // Mod pages: invites (/mod/invite/<token>), self-serve join (/mod/join/<slug>)
  // and a mod's view of a streamer (/mod/<slug>) all send people back after sign-in.
  "/mod/",
  // Signing up from the Discord Activity (/discord/join, /discord/joined) and
  // "Add to Discord" (/discord/add: sign up, then straight into the bot install).
  "/discord",
  // Every other page that sends someone to sign in and expects them back
  // (2026-10-13: Twitch, Discord and magic-link sign-ins from these landed on
  // /account because they weren't listed; password sign-in already returned).
  "/tcg-companion",     // the companion, incl. a Play together joiner (?play=CODE) and ?deck=
  "/pokemon-tcg/",      // deck guides' "Sign in to save this deck", checklists
  "/trivia",
  "/daily",
  "/daily-dex",
  "/daily-trivia",
  "/daily-duel",
  "/pokemon-trainers",
  "/mmr-card",
  "/lounge",
  "/weekly",
  "/chat-brain",
  "/arcade",
  "/communities",
  "/community/",
  "/c",
  "/game-nights",
  "/championship/",
  "/ideas",
  "/players",
  "/u/",
  "/comms",
  "/beta",
  "/gs-circuit",
  "/gs-pro",
  "/support",
  "/shop",
];

export function safeRedirect(raw: string | null, fallback = "/account"): string {
  if (!raw) return fallback;
  // Reject anything that looks like an absolute URL or protocol-relative.
  if (raw.startsWith("//") || raw.includes("://")) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // Browsers read "/\\evil.com" as "//evil.com"; control characters have no place in a path.
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
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

