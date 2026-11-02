/**
 * Pages a checkout may come back to instead of its usual page (try before paying, 2026-10-29). The
 * page reads ?checkout=success|canceled&plan=<pro|supporter|backer|champion>&session_id=. GS Pro waits
 * for the webhook (it sends the trial-started email only when it's first to see the subscription);
 * monthly support is recorded by the page with fulfilSupportSession, as /support/thanks does.
 */
export const CHECKOUT_RETURN_PATHS = ["/mmr-card"];
/** Pages with an id in the address: a war overlay's setup page (/war-overlay/<token>). */
const RETURN_PATTERNS = [/^\/war-overlay\/[a-f0-9]{24}$/];

/** The page a checkout may come back to, or null. */
export function checkoutReturnPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return CHECKOUT_RETURN_PATHS.includes(v) || RETURN_PATTERNS.some((r) => r.test(v)) ? v : null;
}
