/**
 * The password rules, one copy for every form that sets a password (signup,
 * reset, the backup-password prompt, Settings). They match what Supabase
 * enforces on our projects (lowercase, uppercase, number and symbol, 8+
 * characters; it also turns away passwords seen in data breaches, which only
 * the server can check). Client-safe.
 */

export const PASSWORD_HINT = "At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

const RULES: { ok: (p: string) => boolean; fix: string }[] = [
  { ok: (p) => p.length >= 8, fix: "Use at least 8 characters." },
  { ok: (p) => /[A-Z]/.test(p), fix: "Add an uppercase letter." },
  { ok: (p) => /[a-z]/.test(p), fix: "Add a lowercase letter." },
  { ok: (p) => /[0-9]/.test(p), fix: "Add a number." },
  { ok: (p) => /[^A-Za-z0-9]/.test(p), fix: "Add a symbol, like ! or #." },
];

/** The first thing to fix, or null when the password meets every rule. */
export function passwordProblem(password: string): string | null {
  return RULES.find((r) => !r.ok(password))?.fix ?? null;
}

/**
 * Whether the account has a password, from its app_metadata. `has_password`
 * is kept by a trigger on auth.users (supabase/auth-has-password-m1.sql);
 * null means the trigger hasn't run for this account yet, and the caller
 * falls back to its old check (the sign-in providers list, which only shows
 * "email" after an email sign-in, not after a password is saved).
 */
export function passwordFlag(appMetadata: Record<string, unknown> | null | undefined): boolean | null {
  const flag = appMetadata?.has_password;
  return typeof flag === "boolean" ? flag : null;
}

/** has_password when known, else the providers list (empty counts as yes, so nobody is bounced by mistake). */
export function hasPasswordFrom(appMetadata: Record<string, unknown> | null | undefined): boolean {
  const flag = passwordFlag(appMetadata);
  if (flag !== null) return flag;
  const providers = Array.isArray(appMetadata?.providers) ? (appMetadata.providers as string[]) : [];
  return providers.length === 0 || providers.includes("email");
}
