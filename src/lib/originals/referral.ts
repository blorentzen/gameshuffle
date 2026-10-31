/**
 * Referral links on the dailies, in the browser (Britton's picks, 2026-10-16;
 * server: src/lib/referrals/store.ts). A friend's `?r=CODE` is remembered here
 * (localStorage `gs-ref`) for a week, first link wins, with whether this
 * browser had played a daily before; the games report a finished game once per
 * game, and signing in claims the sign-up bonus once. Client-safe and light.
 */

import { REFERRAL_CODE_RE } from "@/lib/referrals/types";

const KEY = "gs-ref";
const DAY_MS = 86_400_000;

export interface StoredReferral {
  code: string;
  /** When the link was first opened (ms). */
  at: number;
  /** This browser had never finished a daily when the link was opened. */
  fresh: boolean;
  /** Games already reported as finished. */
  sent?: string[];
  /** The sign-up claim has been answered. */
  claimed?: boolean;
}

function read(): StoredReferral | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as StoredReferral | null; } catch { return null; }
}
function write(r: StoredReferral) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* this visit only */ }
}

/** Has this browser finished a daily before? (Any game's stats, or the dailies' history.) */
export function hasDailyHistory(): boolean {
  try {
    for (const k of ["gs-daily-shuffle", "gs-daily-dex"]) {
      const s = JSON.parse(localStorage.getItem(k) ?? "null") as { stats?: { played?: number } } | null;
      if ((s?.stats?.played ?? 0) > 0) return true;
    }
    const d = JSON.parse(localStorage.getItem("gs-dailies") ?? "null") as { history?: Record<string, Record<string, unknown>> } | null;
    return Object.values(d?.history ?? {}).some((h) => Object.keys(h ?? {}).length > 0);
  } catch {
    return false;
  }
}

/** The friend's link, if one is remembered and still within `linkDays`. */
export function storedReferral(linkDays = 7): StoredReferral | null {
  const r = read();
  return r && REFERRAL_CODE_RE.test(r.code) && Date.now() - r.at < linkDays * DAY_MS ? r : null;
}

/**
 * Notes `?r=CODE` from the address (first link wins while it lasts), then
 * takes it out of the address so a reshare doesn't carry someone else's code.
 * `fromCard`: the sharer's code on a shared result page (/r/<code>), which
 * counts the same way.
 */
export function captureReferral(linkDays = 7, fromCard?: string | null): StoredReferral | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("r");
    if (raw !== null) {
      const code = raw.trim().toUpperCase();
      if (REFERRAL_CODE_RE.test(code) && !storedReferral(linkDays)) write({ code, at: Date.now(), fresh: !hasDailyHistory() });
      url.searchParams.delete("r");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const card = fromCard?.trim().toUpperCase();
    if (card && REFERRAL_CODE_RE.test(card) && !storedReferral(linkDays)) write({ code: card, at: Date.now(), fresh: !hasDailyHistory() });
  } catch { /* no link today */ }
  return storedReferral(linkDays);
}

export function updateReferral(patch: Partial<StoredReferral>) {
  const r = read();
  if (r) write({ ...r, ...patch });
}

/** Adds your code to the dailies' links in a share text (gameshuffle.co/daily → …/daily?r=CODE). */
export function withReferral(text: string, code: string | null | undefined): string {
  if (!code || !REFERRAL_CODE_RE.test(code)) return text;
  return text.replace(/gameshuffle\.co\/(daily-dex|daily|weekly)(?![\w/?=-])/g, `gameshuffle.co/$1?r=${code}`);
}

/** The full link for copying: https://www.gameshuffle.co/daily?r=CODE. */
export function referralLink(path: string, code: string): string {
  return `https://www.gameshuffle.co${path}?r=${code}`;
}
