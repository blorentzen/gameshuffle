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
