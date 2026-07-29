/**
 * Lead-source attribution.
 *
 * Captures inbound campaign traffic tagged with a `?src=` param and reports it
 * to Plausible + GA4. The first live campaign is the printed TCG-shop insert,
 * which links to `gameshuffle.co?src=tcg-insert`.
 *
 * The source is persisted to localStorage so a downstream conversion (signup)
 * can be attributed back to the campaign — not just the initial landing hit —
 * which is what makes "how does this lead perform?" answerable.
 *
 * Plausible is cookieless and always loaded, so the landing event is reliable.
 * GA4 only exists after cookie consent, so its call is best-effort.
 */

/** localStorage key holding the visitor's captured lead source. */
export const LEAD_SOURCE_KEY = "gs-lead-source";

/** sessionStorage key guarding against double-firing on refresh. */
const LEAD_FIRED_KEY = "gs-lead-fired";

/** A clean campaign slug — lowercase letters, digits, dash/underscore. Keeps
 *  arbitrary or injected `?src=` values out of the funnel while still accepting
 *  any future insert/flyer code (e.g. `tcg-insert`) without a code change. */
const SLUG_RE = /^[a-z0-9_-]{1,32}$/;

type Gtag = (
  command: string,
  event: string,
  params?: Record<string, unknown>,
) => void;

function sanitizeSource(raw: string | null): string | null {
  if (!raw) return null;
  const src = raw.trim().toLowerCase();
  return SLUG_RE.test(src) ? src : null;
}

/** Read + sanitize the `src` param from the current URL. */
export function readLeadSourceParam(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeSource(
      new URLSearchParams(window.location.search).get("src"),
    );
  } catch {
    return null;
  }
}

/** The lead source captured earlier this session/browser, if any. */
export function getStoredLeadSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LEAD_SOURCE_KEY);
  } catch {
    return null;
  }
}

/**
 * Capture the current URL's `?src=` (if present), persist it, and fire the
 * "Lead" event to Plausible + GA4 exactly once per browser session. No-op when
 * there's no tagged source. Safe to call on every page load.
 */
export function captureLeadSource(): void {
  const src = readLeadSourceParam();
  if (!src) return;

  try {
    window.localStorage.setItem(LEAD_SOURCE_KEY, src);
  } catch {
    // localStorage blocked (private mode) — attribution just won't carry to
    // the eventual conversion; the landing event below still fires.
  }

  // De-dupe: refreshing the landing URL shouldn't inflate the lead count.
  try {
    if (window.sessionStorage.getItem(LEAD_FIRED_KEY) === src) return;
    window.sessionStorage.setItem(LEAD_FIRED_KEY, src);
  } catch {
    // sessionStorage blocked — fall through and fire (best effort).
  }

  window.plausible?.("Lead", { props: { source: src } });

  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag === "function") {
    gtag("event", "lead", { source: src });
  }
}
