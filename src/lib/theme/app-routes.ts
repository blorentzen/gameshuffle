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
  "/comms",
  "/players",
] as const;

/** Auth-gated routes that live INSIDE an otherwise-public namespace.
 *  Tournament browse and individual tournament pages are public (kept
 *  in marketing/light), but `create` and `[id]/manage` are organizer
 *  tools that strictly require auth — they get theming. */
export const APP_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/tournament\/create(\/|$)/,
  /^\/tournament\/[^/]+\/manage(\/|$)/,
  /^\/tournament\/championship\/[^/]+\/manage(\/|$)/,
  // Game nights: browse + detail are public (light); host tools are auth.
  /^\/game-nights\/create(\/|$)/,
  /^\/game-nights\/[^/]+\/manage(\/|$)/,
  // Trivia: the hub, phones and the TV are public; building and hosting a night are auth.
  /^\/trivia\/host(\/|$)/,
  /^\/trivia\/leagues\/new(\/|$)/,
  /^\/trivia\/leagues\/[^/]+\/manage(\/|$)/,
];

/** Public landings inside an app namespace: signed-out visitors land
 *  here, so they stay light like every other public page. */
const PUBLIC_EXCEPTIONS: readonly RegExp[] = [
  // A mod joining from a chat link, often before they have an account.
  /^\/mod\/join(\/|$)/,
];

/** True when this pathname is an app surface (theming applies).
 *  False = marketing / public, force light mode. */
export function isAppRoute(pathname: string): boolean {
  if (PUBLIC_EXCEPTIONS.some((re) => re.test(pathname))) return false;
  if (
    APP_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  return APP_ROUTE_PATTERNS.some((re) => re.test(pathname));
}
