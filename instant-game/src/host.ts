/**
 * The game's one link to Facebook: the Instant Games SDK when the game runs on
 * Facebook's hosts (*.fbsbx.com), a stand-in everywhere else (local testing),
 * so the rest of the game never checks where it is.
 *
 * Saved per player in Facebook's own storage (player.setDataAsync), never on
 * our servers: a random id the game makes (sent with answers so one person
 * answers once), the streak, and the last week of days played.
 */

export interface DayRecord {
  answer?: string;
  line?: string;
  board?: { id: string; found: Found[]; strikes: number; done: boolean; reveal?: Found[] };
}
export interface Found { rank: number; label: string; points: number }
export interface SaveData { anon: string; streak: { last: string | null; count: number }; days: Record<string, DayRecord> }

interface FBInstantApi {
  initializeAsync(): Promise<void>;
  setLoadingProgress(p: number): void;
  startGameAsync(): Promise<void>;
  player: { getDataAsync(keys: string[]): Promise<Record<string, unknown>>; setDataAsync(d: Record<string, unknown>): Promise<void> };
  shareAsync(payload: { intent?: string; image: string; text: string; data?: Record<string, unknown> }): Promise<void>;
}

declare global {
  interface Window { FBInstant?: FBInstantApi }
}

export interface GameHost {
  inFacebook: boolean;
  start(): Promise<void>;
  load(): Promise<SaveData>;
  save(d: SaveData): Promise<void>;
  share(image: string, text: string): Promise<void>;
}

const KEY = "gs";

function freshSave(): SaveData {
  const anon = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return { anon, streak: { last: null, count: 0 }, days: {} };
}

function readSave(raw: unknown): SaveData {
  const d = raw as Partial<SaveData> | null;
  if (!d || typeof d.anon !== "string" || !/^[0-9a-f-]{16,64}$/i.test(d.anon)) return freshSave();
  return { anon: d.anon, streak: d.streak ?? { last: null, count: 0 }, days: d.days ?? {} };
}

/** Keeps the last 7 days so the saved record stays small. */
function trim(d: SaveData): SaveData {
  const days = Object.keys(d.days).sort().slice(-7);
  return { ...d, days: Object.fromEntries(days.map((k) => [k, d.days[k]])) };
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
    async share(image, text) {
      await fb.shareAsync({ intent: "SHARE", image, text, data: { from: "share" } });
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
    async share(image, text) {
      // Outside Facebook there's no share sheet: show what would be shared.
      console.info("[instant] share:", text);
      const w = window.open();
      if (w) w.document.write(`<title>Share preview</title><p style="font:16px system-ui">${text.replace(/</g, "&lt;")}</p><img src="${image}" style="max-width:100%">`);
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

/** Today counted once: the streak goes up when yesterday was played, else starts again. */
export function bumpStreak(s: SaveData, day: string): SaveData {
  if (s.streak.last === day) return s;
  const count = s.streak.last === dayBefore(day) ? s.streak.count + 1 : 1;
  return { ...s, streak: { last: day, count } };
}
