/**
 * Routes that get full theme support (light/dark per cookie + OS pref).
 * Everything else — marketing, public viewers, legal pages — is forced
 * to light mode regardless of the user's saved preference.
 *
 * Rationale: marketing/customer-facing pages should look the same to
 * every visitor so the brand reads consistently. Theming is reserved
 * for surfaces a signed-in user actively *uses* — anything that lives
 * strictly behind authentication.
 */

/** Whole-subtree app surfaces. Match is `pathname === prefix` OR
 *  `pathname.startsWith(prefix + "/")`, so a prefix like `/account`
 *  covers `/account`, `/account/foo`, etc. without accidentally
 *  matching `/account-something`. */
export const APP_ROUTE_PREFIXES = [
  "/account",
  "/hub",
  "/twitch",
  "/staff",
  "/mod",
  "/tcg-companion",
  "/messages",
] as const;

/** Auth-gated routes that live INSIDE an otherwise-public namespace.
 *  Tournament browse and individual tournament pages are public (kept
 *  in marketing/light), but `create` and `[id]/manage` are organizer
 *  tools that strictly require auth — they get theming. */
export const APP_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/tournament\/create(\/|$)/,
  /^\/tournament\/[^/]+\/manage(\/|$)/,
];

/** True when this pathname is an app surface (theming applies).
 *  False = marketing / public, force light mode. */
export function isAppRoute(pathname: string): boolean {
  if (
    APP_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  return APP_ROUTE_PATTERNS.some((re) => re.test(pathname));
}
