/**
 * Time trial rules, pure and client-safe: reading and writing times, ranking a
 * board, and which proof links count.
 *
 * Times are whole milliseconds. Both games show a 3-lap time as m:ss.mmm
 * ("1:52.384"); people also type 1'52"384, 1:52:384 or 1.52.384.
 */

export const MIN_MS = 30_000;
export const MAX_MS = 10 * 60_000;

/** A typed time in ms, or null when it can't be read or is outside 0:30 to 10:00. */
export function parseTime(raw: string): number | null {
  const s = raw.trim().replace(/[″”"]/g, '"').replace(/[′’']/g, "'").replace(/\s+/g, "");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let min = 0, sec = 0, ms = 0;
  if ((m = s.match(/^(\d{1,2})[:'.](\d{2})[."':,](\d{1,3})$/))) {
    min = +m[1]; sec = +m[2]; ms = +m[3].padEnd(3, "0");
  } else if ((m = s.match(/^(\d{1,2})[:'](\d{2})$/))) {
    min = +m[1]; sec = +m[2];
  } else if ((m = s.match(/^(\d{1,3})[.,"](\d{1,3})$/))) {
    sec = +m[1]; ms = +m[2].padEnd(3, "0");
  } else if ((m = s.match(/^(\d)(\d{2})(\d{3})$/))) {
    // 152384 = 1:52.384, as some people type it.
    min = +m[1]; sec = +m[2]; ms = +m[3];
  } else return null;
  if (sec > 59 && min > 0) return null;
  const total = min * 60_000 + sec * 1000 + ms;
  return total >= MIN_MS && total <= MAX_MS ? total : null;
}

/** 112384 → "1:52.384". */
export function formatTime(ms: number): string {
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${min}:${String(sec).padStart(2, "0")}.${String(rest).padStart(3, "0")}`;
}

/** 412 → "0.412", 1234 → "1.234": how much faster or slower, without a sign. */
export function formatGap(ms: number): string {
  const a = Math.abs(ms);
  return a >= 60_000 ? formatTime(a) : `${Math.floor(a / 1000)}.${String(a % 1000).padStart(3, "0")}`;
}

export interface RankedRow<T> { rank: number; row: T }

/** Board places: fastest first, equal times share a place (1, 2, 2, 4). */
export function rankRows<T extends { timeMs: number }>(rows: T[]): RankedRow<T>[] {
  const sorted = [...rows].sort((a, b) => a.timeMs - b.timeMs);
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || row.timeMs !== sorted[i - 1].timeMs) rank = i + 1;
    return { rank, row };
  });
}

/** 1 → "1st", 22 → "22nd". */
export function ordinal(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "twitch.tv", "streamable.com", "medal.tv", "bsky.app", "x.com", "twitter.com", "tiktok.com", "instagram.com"];

/** A proof video link we accept (https, a known video host), tidied; else null. */
export function videoProof(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|clips)\./, "");
  if (!VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  u.protocol = "https:";
  u.hash = "";
  return u.toString().slice(0, 300);
}

export type ProofKind = "none" | "screenshot" | "video";

/** "u:<account>" for accounts, "i:<identity>" for Discord players without one (as the dailies). */
export type TtPlayer = `u:${string}` | `i:${string}`;
export function ttPlayer(kind: "u" | "i", id: string): TtPlayer {
  return `${kind}:${id}` as TtPlayer;
}
export function parseTtPlayer(key: string): { kind: "u" | "i"; id: string } | null {
  const m = key.match(/^([ui]):([0-9a-f-]{36})$/);
  return m ? { kind: m[1] as "u" | "i", id: m[2] } : null;
}

/**
 * Where a time's video stands (round 2, Britton 2026-10-29): every time shows in its place, Unverified
 * until a reviewer checks a clip of the run's last 30 seconds and flips it to Verified. none = no clip
 * yet, waiting = a clip in the review queue, checked = Verified, rejected = a reviewer asked for an update ("Update asked").
 */
export type VideoState = "none" | "waiting" | "checked" | "rejected";

export function isVerified(v: VideoState): boolean {
  return v === "checked";
}

/** Vouches that give a time the Community verified mark (players' feedback, picks 2026-11-04, 19A: anyone signed in
 *  vouches, never for their own time). A checked clip still gives Verified, and a top-ten time without one still
 *  asks for a clip. */
export const COMMUNITY_VOUCHES = 10;

/** A time's label, wherever it shows. Under review first, then a checked clip, then ten vouches, then the clip's
 *  state, then Trusted for a top-ten time; other times carry no label. */
export type TimeStatus = "verified" | "sheet" | "community" | "trusted" | "review" | "waiting" | "rejected" | "unverified" | "none";

/** `sheet`: a top-ten time from the community's Top 10 sheets, whose keepers check every time (round 4). */
export function timeStatus(t: {
  review: boolean; video: VideoState; videoUrl: string | null; top: boolean; trusted: boolean; you: boolean; vouches: number; sheet?: boolean;
}): TimeStatus {
  if (t.review) return "review";
  if (t.video === "checked") return "verified";
  // Like Verified, the sheet's mark only shows in the top ten; further down the proof column says where it came from.
  if (t.sheet && t.top) return "sheet";
  if (t.vouches >= COMMUNITY_VOUCHES) return "community";
  // A reviewer's ask (picks 2026-11-08) shows to its player on any time, even one that has slipped out of the top ten.
  if (t.video === "rejected" && t.you) return "rejected";
  if (!t.top) return "none";
  if (t.video === "waiting" && t.videoUrl) return "waiting";
  if (t.trusted) return "trusted";
  return "unverified";
}

// ── Laps (round 3 pick 2A) ──────────────────────────────────────────────────────────────────────

/** A lap time in ms ("34.112", "0:34.112", "1:02.034"), or null outside 5 seconds to 5 minutes. */
export function parseLap(raw: string): number | null {
  const s = raw.trim().replace(/[″”"]/g, '"').replace(/[′’']/g, "'").replace(/\s+/g, "");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let ms: number;
  if ((m = s.match(/^(\d{1,2})[:'.](\d{2})[."':,](\d{1,3})$/))) ms = +m[1] * 60_000 + +m[2] * 1000 + +m[3].padEnd(3, "0");
  else if ((m = s.match(/^(\d{1,3})[.,"](\d{1,3})$/))) ms = +m[1] * 1000 + +m[2].padEnd(3, "0");
  else return null;
  return ms >= 5000 && ms <= 300_000 ? ms : null;
}

/** 34112 → "34.112", 62034 → "1:02.034". */
export function formatLap(ms: number): string {
  return ms >= 60_000 ? formatTime(ms) : `${Math.floor(ms / 1000)}.${String(ms % 1000).padStart(3, "0")}`;
}

/** The game shows each lap rounded, so laps can miss the total by a few ms and still be right. */
export const LAP_SLACK_MS = 3;

/** Laps that are all there (3, or a track's own count up to 7) and add up to the time. */
export function lapsAddUp(laps: number[] | null | undefined, timeMs: number): boolean {
  if (!laps?.length) return true;
  return Math.abs(laps.reduce((a, b) => a + b, 0) - timeMs) <= LAP_SLACK_MS;
}

/** Cleans laps from a client: whole ms, 1 to 7 of them, each inside the lap range; else null. */
export function cleanLaps(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.length || v.length > 7) return null;
  const out = v.map((x) => Math.round(Number(x)));
  return out.every((x) => Number.isFinite(x) && x >= 5000 && x <= 300_000) ? out : null;
}

/** After this many checked clips with none turned down, a player's new top-ten times show as Trusted without a clip (pick 7A). */
export const TRUSTED_AFTER = 10;
