/**
 * Canonical username/handle rules — shared by the client (account form), the
 * server (availability API), and mirrored by the DB constraints in
 * `supabase/username-hardening.sql`. Keep the reserved list + pattern in sync
 * with that migration.
 *
 * Handles are stored lowercase and are unique case-insensitively (a unique index
 * on `lower(username)`). The DB is the real guard; this module is for validation
 * + friendly messages and must not be the only line of defense.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Handles that can't be claimed — impersonation-risky names, system/brand words,
 * and app route segments. Mirror this in the migration's CHECK constraint.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // brand / impersonation
  "gameshuffle", "gameshuffleco", "official", "team", "staff", "admin", "administrator",
  "moderator", "mod", "support", "help", "helpdesk", "system", "root", "owner", "billing",
  "security", "legal", "privacy", "noreply", "no-reply",
  // auth / account
  "account", "accounts", "settings", "login", "logout", "signin", "sign-in", "signup",
  "sign-up", "signout", "auth", "register", "password", "verify", "unsubscribe",
  // app route segments
  "api", "app", "hub", "twitch", "discord", "comms", "messages", "message", "tournament",
  "tournaments", "competitive", "randomizer", "randomizers", "live", "lobby", "overlay",
  "stream", "stream-card", "profile", "user", "users", "wheel", "wheel-spinner", "tools",
  "features", "apps", "pro", "gs-pro", "tcg", "tcg-companion", "quotes", "contact",
  "contact-us", "terms", "cookie-policy", "accessibility", "data-request", "staff",
  // generic placeholders
  "me", "you", "new", "edit", "create", "delete", "null", "undefined", "none", "test",
  "home", "about", "gameshuffle-official",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export type UsernameCheck = { ok: true; value: string } | { ok: false; error: string };

/** Validate + normalize a raw handle. Returns the lowercase value to store. */
export function validateUsername(raw: string): UsernameCheck {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN) return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
  if (value.length > USERNAME_MAX) return { ok: false, error: `Username must be ${USERNAME_MAX} characters or fewer.` };
  if (!USERNAME_PATTERN.test(value)) return { ok: false, error: "Username can only contain lowercase letters, numbers, hyphens, and underscores." };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, error: "That username is reserved — please choose another." };
  return { ok: true, value };
}
