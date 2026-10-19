/**
 * The game's one link to Facebook: the Instant Games SDK when the game runs on
 * Facebook's hosts (*.fbsbx.com), a stand-in everywhere else (local testing),
 * so the rest of the game never checks where it is.
 *
 * Saved per player in Facebook's own storage (player.setDataAsync), never on
 * our servers: a random id the game makes (sent with answers so one person
 * answers once), the streaks, the last week of days played, and for the
 * dailies a second random id, the daily leaderboard's: sent when a puzzle
 * starts (so the solve time can count) and, only if the player joins the
 * board with a nickname, with each finished game. Neither id is a Facebook id.
 */

export interface DayRecord {
  answer?: string;
  line?: string;
  board?: { id: string; found: Found[]; strikes: number; done: boolean; reveal?: Found[] };
}
export interface Found { rank: number; label: string; points: number }
export type DailyId = "shuffle" | "dex";
/** One day of a daily: the guesses so far and the clock (Start to the last guess). */
export interface DailyDay { guesses: string[]; startedAt?: number; finishedAt?: number; sent?: boolean }
export interface Streak { last: string | null; count: number }
export interface SaveData {
  anon: string;
  /** Chat Brain's streak (days played). */
  streak: Streak;
  days: Record<string, DayRecord>;
  daily?: Partial<Record<DailyId, Record<string, DailyDay>>>;
  /** The dailies' streaks (days solved, a save on the last chance included). */
  streaks?: Partial<Record<DailyId, Streak>>;
  /** The daily leaderboard id (the site's guest id format); only sent to us when the player joins with a nickname. */
  guest?: string;
}

interface FBInstantApi {
  initializeAsync(): Promise<void>;
  setLoadingProgress(p: number): void;
  startGameAsync(): Promise<void>;
  player: { getDataAsync(keys: string[]): Promise<Record<string, unknown>>; setDataAsync(d: Record<string, unknown>): Promise<void> };
  shareAsync(payload: { intent?: string; image: string; text: string; data?: Record<string, unknown> }): Promise<void>;
  getEntryPointData(): Record<string, unknown> | null;
}

declare global {
  interface Window { FBInstant?: FBInstantApi }
}

export interface GameHost {
  inFacebook: boolean;
  start(): Promise<void>;
  load(): Promise<SaveData>;
  save(d: SaveData): Promise<void>;
  /** `game` rides with the share, so a friend who opens it lands on that game's tab. */
  share(image: string, text: string, game: GameTab): Promise<void>;
  /** The game a shared post came from (null when opened any other way). */
  entry(): GameTab | null;
}

export type GameTab = "daily" | "dex" | "brain";
const isTab = (v: unknown): v is GameTab => v === "daily" || v === "dex" || v === "brain";

const KEY = "gs";

function freshSave(): SaveData {
  const anon = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return { anon, streak: { last: null, count: 0 }, days: {} };
}

function readSave(raw: unknown): SaveData {
  const d = raw as Partial<SaveData> | null;
  if (!d || typeof d.anon !== "string" || !/^[0-9a-f-]{16,64}$/i.test(d.anon)) return freshSave();
  return { anon: d.anon, streak: d.streak ?? { last: null, count: 0 }, days: d.days ?? {}, daily: d.daily ?? {}, streaks: d.streaks ?? {}, guest: typeof d.guest === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(d.guest) ? d.guest : undefined };
}

const lastWeek = <T,>(rec: Record<string, T> | undefined): Record<string, T> => {
  const keys = Object.keys(rec ?? {}).sort().slice(-7);
  return Object.fromEntries(keys.map((k) => [k, rec![k]]));
};

/** Keeps the last 7 days of everything so the saved record stays small. */
function trim(d: SaveData): SaveData {
  return {
    ...d,
    days: lastWeek(d.days),
    daily: Object.fromEntries(Object.entries(d.daily ?? {}).map(([g, rec]) => [g, lastWeek(rec)])),
  };
}

/** A new daily leaderboard id: 32 url-safe characters, like the site's guest ids. */
export function newGuestId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function facebookHost(fb: FBInstantApi): GameHost {
  return {
    inFacebook: true,
    async start() {
      await fb.initializeAsync();
      fb.setLoadingProgress(100);
      await fb.startGameAsync();
    },
    async load() {
      const got = await fb.player.getDataAsync([KEY]).catch(() => ({} as Record<string, unknown>));
      return readSave(got[KEY]);
    },
    async save(d) {
      await fb.player.setDataAsync({ [KEY]: trim(d) }).catch(() => {});
    },
    async share(image, text, game) {
      await fb.shareAsync({ intent: "SHARE", image, text, data: { from: "share", game } });
    },
    entry() {
      try { const g = fb.getEntryPointData()?.game; return isTab(g) ? g : null; } catch { return null; }
    },
  };
}

function localHost(): GameHost {
  const LS = "gs-instant-local";
  return {
    inFacebook: false,
    async start() { /* nothing to start outside Facebook */ },
    async load() {
      try { return readSave(JSON.parse(localStorage.getItem(LS) ?? "null")); } catch { return freshSave(); }
    },
    async save(d) {
      try { localStorage.setItem(LS, JSON.stringify(trim(d))); } catch { /* fine */ }
    },
    async share(image, text, game) {
      // Outside Facebook there's no share sheet: show what would be shared.
      console.info("[instant] share:", game, text);
      const w = window.open();
      if (w) w.document.write(`<title>Share preview</title><p style="font:16px system-ui">${text.replace(/</g, "&lt;")}</p><img src="${image}" style="max-width:100%">`);
    },
    entry() {
      // ?game=dex stands in for a shared post's data when testing.
      const g = new URLSearchParams(location.search).get("game");
      return isTab(g) ? g : null;
    },
  };
}

export function gameHost(): GameHost {
  const onFacebook = /\.fbsbx\.com$/i.test(location.hostname);
  return onFacebook && window.FBInstant ? facebookHost(window.FBInstant) : localHost();
}

/** The day before a YYYY-MM-DD day. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A streak with today counted once: it goes up when yesterday counted too, else starts again. */
export function nextStreak(st: Streak | undefined, day: string): Streak {
  const cur = st ?? { last: null, count: 0 };
  if (cur.last === day) return cur;
  return { last: day, count: cur.last === dayBefore(day) ? cur.count + 1 : 1 };
}

/** Chat Brain's streak: today counted once. */
export function bumpStreak(s: SaveData, day: string): SaveData {
  const streak = nextStreak(s.streak, day);
  return streak === s.streak ? s : { ...s, streak };
}

/** A streak as shown today: still alive if it last counted today or yesterday. */
export function liveStreak(st: Streak | undefined, today: string): number {
  return st && (st.last === today || st.last === dayBefore(today)) ? st.count : 0;
}
