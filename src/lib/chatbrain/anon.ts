/**
 * The signed-out answerer's browser id (client only). Kept in localStorage so
 * one browser counts as one person; hashed on the server, never stored raw.
 */
const ANON_KEY = "gs-brain-anon";

export function brainAnonId(): string {
  try {
    const have = window.localStorage.getItem(ANON_KEY);
    if (have) return have;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(ANON_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

const AUDIENCE_KEY = "gs-brain-audience";

/** A signed-out visitor's audience choices, kept in their browser. */
export interface LocalAudience { ageBand: string | null; gender: string | null; country: string | null; countryChosen: boolean }

export function loadLocalAudience(): LocalAudience | null {
  try {
    const raw = window.localStorage.getItem(AUDIENCE_KEY);
    return raw ? (JSON.parse(raw) as LocalAudience) : null;
  } catch {
    return null;
  }
}

export function saveLocalAudience(a: LocalAudience): void {
  try { window.localStorage.setItem(AUDIENCE_KEY, JSON.stringify(a)); } catch { /* still works this visit */ }
}
