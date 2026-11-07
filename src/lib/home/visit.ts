/**
 * The signed-in home's memory of your last visit (home look picks 2026-11-05, 6A and 7A): one small first-party
 * cookie, `gs-home`, read by the server so the page can say what changed ("Since you were here"), let the tiles rise
 * once a day and roll your numbers from where they were, all in the first paint (no flash, no client fetch).
 *
 * Only numbers and times: when you last loaded the home, the time "since" is measured from, the day the tiles last
 * rose, your lounge MMR, your best daily streak and your Trainer Road stars. Tied to the account (the id's first 8
 * characters) so another account in the same browser starts fresh. The MMR card keeps the newest change it showed in
 * its own cookie (`gs-home-mmr`), written once it has played, so the two never overwrite each other.
 */

export const VISIT_COOKIE = "gs-home";
export const MMR_SEEN_COOKIE = "gs-home-mmr";
/** Loads closer together than this are one visit: "since" stays put across reloads. */
export const VISIT_GAP_MS = 30 * 60_000;
export const VISIT_MAX_AGE = 120 * 24 * 3600;

export interface Visit {
  /** The account this belongs to (first 8 characters of the id, plus a persona key while previewing). */
  who: string;
  /** Last homepage load, ms. */
  last: number;
  /** What "Since you were here" measures from, ms (the end of the visit before this one). */
  since: number;
  /** The Pacific day the tiles last rose in. */
  rose: string;
  /** Lounge MMR at the last load (0 = none). */
  mmr: number;
  /** Best daily streak at the last load. */
  streak: number;
  /** Trainer Road stars this month at the last load. */
  stars: number;
}

const num = (s: string | undefined, radix = 10) => {
  const n = s ? parseInt(s, radix) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Reads the cookie; null when it's missing, someone else's or not ours. */
export function readVisit(raw: string | undefined | null, who: string): Visit | null {
  if (!raw || raw.length > 200) return null;
  const p = raw.split(".");
  if (p[0] !== "v1" || p.length !== 9 || p[1] !== who) return null;
  const rose = p[4];
  return {
    who,
    last: num(p[2], 36) * 1000,
    since: num(p[3], 36) * 1000,
    rose: /^\d{4}-\d{2}-\d{2}$/.test(rose) ? rose : "",
    mmr: Math.min(num(p[5]), 1_000_000),
    streak: Math.min(num(p[6]), 100_000),
    stars: Math.min(num(p[7]), 100_000),
  };
}

export function writeVisit(v: Visit): string {
  const s = (ms: number) => Math.floor(ms / 1000).toString(36);
  // Cookie-safe: letters, digits, dots, hyphens; the persona key uses only those too.
  return ["v1", v.who, s(v.last), s(v.since), v.rose, String(v.mmr), String(v.streak), String(v.stars), "1"].join(".");
}

/** This load as a visit: "since" moves to the last load once the gap says it's a new visit. */
export function nextVisit(prev: Visit | null, now: number, base: Omit<Visit, "last" | "since">): Visit {
  const since = !prev ? now : now - prev.last > VISIT_GAP_MS ? prev.last : prev.since || prev.last;
  return { ...base, last: now, since };
}

/** The MMR card's last-seen change: `<who>.<change id>`. */
export function readMmrSeen(raw: string | undefined | null, who: string): number | null {
  if (!raw || raw.length > 60) return null;
  const [w, id] = raw.split(".");
  if (w !== who) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export const writeMmrSeen = (who: string, id: number) => `${who}.${Math.max(0, Math.floor(id))}`;

/** Sets one of the home's cookies from the browser (first-party, a preference: no consent needed). */
export function setHomeCookie(name: string, value: string) {
  try { document.cookie = `${name}=${value}; path=/; max-age=${VISIT_MAX_AGE}; samesite=lax`; } catch { /* blocked */ }
}
