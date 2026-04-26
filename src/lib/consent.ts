/**
 * Cookie consent state — single source of truth.
 *
 * Privacy / Cookie Policy publicly commit to:
 *   • Granular consent (analytics + marketing categories independently)
 *   • Honoring Global Privacy Control (GPC) signals — when set, treat
 *     as a binding decline of all non-essential cookies, regardless of
 *     anything stored in localStorage
 *   • Re-revocable consent (the "Manage cookie preferences" footer link)
 *
 * Storage shape (localStorage `cookieConsent` JSON):
 *   { v: 2, analytics: bool, marketing: bool, savedAt: ISO }
 *
 * v1 was the legacy string-based "accepted" / "declined" — migrated on
 * read. New writes always use v2.
 */

export type ConsentCategory = "analytics" | "marketing";

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  /** True if state has been explicitly set by user (banner answered or prefs saved). */
  decided: boolean;
  /** True if Global Privacy Control is forcing all non-essential consent off. */
  gpcOverride: boolean;
}

const STORAGE_KEY = "cookieConsent";
const STORAGE_VERSION = 2;

/** Subset of Navigator that exposes the GPC bit, with safe fallback. */
function gpcEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true;
}

/**
 * Read current consent state. Always reflects GPC: if GPC is on, every
 * non-essential category resolves to false regardless of stored prefs.
 *
 * Safe to call on the server — returns the SSR-friendly default (decided:
 * false, both off, no GPC) when window/localStorage isn't available.
 */
export function readConsent(): ConsentState {
  if (typeof window === "undefined") {
    return { analytics: false, marketing: false, decided: false, gpcOverride: false };
  }
  const gpc = gpcEnabled();

  let stored: { v?: number; analytics?: boolean; marketing?: boolean } | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Migrate legacy v1 string values
      if (raw === "accepted") stored = { v: 1, analytics: true, marketing: false };
      else if (raw === "declined") stored = { v: 1, analytics: false, marketing: false };
      else stored = JSON.parse(raw);
    }
  } catch {
    stored = null;
  }

  const decided = stored != null;
  const analytics = !gpc && !!stored?.analytics;
  const marketing = !gpc && !!stored?.marketing;

  return { analytics, marketing, decided, gpcOverride: gpc };
}

/** Persist a new consent decision. Writes v2 shape regardless of prior state. */
export function writeConsent(state: { analytics: boolean; marketing: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: STORAGE_VERSION,
        analytics: state.analytics,
        marketing: state.marketing,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Quota exceeded / private browsing — silently fail. The banner will
    // re-prompt on next visit; not catastrophic.
  }
  // Notify listeners (banner, GA loader, manage-prefs modal) in the same tab.
  window.dispatchEvent(new CustomEvent("gs:consent-changed"));
}

/** Subscribe to consent changes — fires whenever writeConsent is called. */
export function onConsentChange(handler: (state: ConsentState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => handler(readConsent());
  window.addEventListener("gs:consent-changed", listener);
  // Also listen for cross-tab storage events
  const storageListener = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener("gs:consent-changed", listener);
    window.removeEventListener("storage", storageListener);
  };
}
