import "server-only";

/**
 * Companion beta-access gate (server module).
 *
 * Per beta-gate-cc-spec:
 *   - `COMPANION_BETA_MODE === "True"` (EXACT string match) controls
 *     whether the gate is reachable at all. Off → /companion/beta
 *     404s and any stored localStorage flag is ignored.
 *   - `COMPANION_BETA_PASSCODE` is the passphrase. NEVER exposed to
 *     the client — comparison happens here, only an ok/not-ok result
 *     ever crosses the boundary.
 */

/**
 * Strict on/off check. Vercel env vars are always strings, so a
 * truthy check would treat `"False"` as on. We require the literal
 * string `"True"` with that exact casing.
 */
export function isBetaModeOn(): boolean {
  return process.env.COMPANION_BETA_MODE === "True";
}

/**
 * Pure-server passcode check. Constant-time comparison so a timing
 * oracle can't be used to leak the passphrase. (The spec says this
 * isn't a security boundary, so this is belt-and-suspenders, but the
 * cost is trivial.)
 */
export function checkBetaPasscode(submitted: string): boolean {
  const expected = process.env.COMPANION_BETA_PASSCODE;
  if (!expected) return false;
  if (typeof submitted !== "string") return false;
  if (submitted.length === 0) return false;
  if (submitted.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ submitted.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Destination inbox for in-app beta feedback. Falls back to the
 * shared support address so the env var stays optional. The address
 * is server-only — never serialized into client props or HTML.
 */
export function feedbackInbox(): string {
  const v = process.env.COMPANION_FEEDBACK_EMAIL;
  return v && v.trim().length > 0 ? v.trim() : "support@gameshuffle.co";
}
