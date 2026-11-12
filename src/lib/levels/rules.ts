/**
 * The level queue's rules and words (levels picks 2026-11-11, picks 16 to 20, all as recommended), pure and
 * client-safe so the dashboard, chat and the tests share them (scripts/test-levels.ts).
 *
 *   - One level per viewer waiting in line; the same level is in line once; one level plays at a time.
 *   - The streamer opens and closes the queue; next comes in order or at random.
 *   - A level played this stream can't come back (this stream = since the stream went live, else since the queue
 *     was opened).
 *   - The game is the one on stream when it's one of the three, else the streamer's pick; a viewer's level waits for
 *     its own game (held, not lost) when the game changes.
 *   - Results: Cleared, Skipped or Gave up, kept with the level. A level moved on with !level next has no result
 *     until the streamer gives it one.
 *   - The sender's thank-you (off by default) is for a level that was played: cleared, given up on, or moved on from
 *     without a result. Never for a skip, and never for likes or favorites (Epic's rules forbid rewards for those).
 */

import { isBlockedText } from "@/lib/text/filter";
import { LEVEL_GAMES, type LevelGame, type QueueGame } from "./games";

export type LevelResult = "cleared" | "skipped" | "gave_up";
export type EntryStatus = "waiting" | "playing" | "played" | "removed";

export const RESULT_WORD: Record<LevelResult, string> = { cleared: "Cleared", skipped: "Skipped", gave_up: "Gave up" };
export const LEVEL_RESULTS: LevelResult[] = ["cleared", "skipped", "gave_up"];

/** The most levels waiting in one game's line. */
export const MAX_LINE = 100;
/** What the overlay lists after the level being played. */
export const OVERLAY_NEXT = 3;
/** Thank-you amounts the dashboard offers (0 = off). */
export const THANKS_CHOICES = [5, 10, 25, 50] as const;
export const THANKS_MAX = 100;

export interface Entry {
  id: string;
  game: QueueGame;
  code: string;
  senderPlatform: string;
  senderId: string;
  senderName: string;
  status: EntryStatus;
  result: LevelResult | null;
  addedAt: string;
  playedAt: string | null;
}

export interface Sender { platform: string; id: string; name: string }

const sameSender = (e: Entry, s: Pick<Sender, "platform" | "id">) => e.senderPlatform === s.platform && e.senderId === s.id;

/** The game the queue takes now: the one on stream when it's a level game, else the dashboard's pick. */
export function queueGame(onStream: QueueGame | null, picked: QueueGame): QueueGame {
  return onStream ?? picked;
}

/** When "this stream" started: going live, else opening the queue (a test without a stream). */
export function streamStart(s: { live: boolean; liveStartedAt: string | null; openedAt: string | null }): string | null {
  return (s.live && s.liveStartedAt) || s.openedAt || null;
}

/** One game's line: its waiting levels, oldest first. */
export function lineOf<T extends Entry>(entries: T[], game: QueueGame): T[] {
  return entries.filter((e) => e.status === "waiting" && e.game === game).sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id));
}

/** A viewer's place in the game's line (1 = next), or null. */
export function positionOf(entries: Entry[], game: QueueGame, sender: Pick<Sender, "platform" | "id">): number | null {
  const i = lineOf(entries, game).findIndex((e) => sameSender(e, sender));
  return i < 0 ? null : i + 1;
}

/** Played this stream: the game's played levels since `since`. */
export function playedSince<T extends Entry>(entries: T[], game: QueueGame, since: string | null): T[] {
  return entries
    .filter((e) => e.status === "played" && e.game === game && !!e.playedAt && (!since || e.playedAt >= since))
    .sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? ""));
}

export type AddRefusal = "closed" | "played" | "in_line" | "yours" | "full";

/**
 * Whether a checked code can join the line. `entries` = the streamer's waiting, playing and recently played levels.
 * In order: the queue must be open; a level played this stream can't come back; the same level can't be in line
 * twice; one level per viewer waiting; the line has room.
 */
export function addCheck(a: {
  open: boolean; game: QueueGame; code: string; sender: Pick<Sender, "platform" | "id">;
  entries: Entry[]; since: string | null;
}): { ok: true; position: number } | { ok: false; why: AddRefusal; position?: number } {
  if (!a.open) return { ok: false, why: "closed" };
  if (playedSince(a.entries, a.game, a.since).some((e) => e.code === a.code)) return { ok: false, why: "played" };
  const line = lineOf(a.entries, a.game);
  const playing = a.entries.find((e) => e.status === "playing");
  if (playing && playing.game === a.game && playing.code === a.code) return { ok: false, why: "in_line", position: 0 };
  const same = line.findIndex((e) => e.code === a.code);
  if (same >= 0) return { ok: false, why: "in_line", position: same + 1 };
  const mine = a.entries.filter((e) => e.status === "waiting" && sameSender(e, a.sender)).sort((x, y) => x.addedAt.localeCompare(y.addedAt))[0];
  if (mine) return { ok: false, why: "yours", position: mine.game === a.game ? positionOf(a.entries, a.game, a.sender) ?? undefined : undefined };
  if (line.length >= MAX_LINE) return { ok: false, why: "full" };
  return { ok: true, position: line.length + 1 };
}

/** The next level: the oldest in line, or one at random (`rand` in [0, 1)). */
export function pickNext<T extends Entry>(line: T[], mode: "next" | "random", rand: () => number = Math.random): T | null {
  if (!line.length) return null;
  if (mode === "next") return line[0];
  return line[Math.min(line.length - 1, Math.floor(rand() * line.length))];
}

/** Whether a played level earns its sender the thank-you (when the streamer turned it on). */
export function earnsThanks(result: LevelResult | null, platform: string): boolean {
  return result !== "skipped" && (platform === "twitch" || platform === "youtube");
}

/** A thank-you amount the dashboard can save: 0 (off) or 1 to 100. */
export function cleanThanks(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(THANKS_MAX, v);
}

/** A result word from chat ("cleared", "gave up", "gaveup", "skip"), or null. */
export function readResult(word: string | null | undefined): LevelResult | null {
  const w = (word ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["cleared", "clear", "won", "win", "beat", "done"].includes(w)) return "cleared";
  if (["skipped", "skip"].includes(w)) return "skipped";
  if (["gaveup", "giveup", "quit", "dnf"].includes(w)) return "gave_up";
  return null;
}

// ── Chat lines ───────────────────────────────────────────────────────────────

/** "@Riley you're #2 in line. !position checks, !remove takes it out." */
export function addedLine(name: string, position: number): string {
  return position === 1
    ? `@${name} you're next in line. !position checks, !remove takes it out.`
    : `@${name} you're #${position} in line. !position checks, !remove takes it out.`;
}

export function refusedLine(name: string, why: AddRefusal, game: QueueGame, position?: number): string {
  const g = LEVEL_GAMES[game];
  if (why === "closed") return `@${name} the level queue is closed right now.`;
  if (why === "played") return `@${name} that level was already played this stream.`;
  if (why === "in_line") return position === 0 ? `@${name} that level is being played right now.` : `@${name} that level is already in line${position ? ` at #${position}` : ""}.`;
  if (why === "yours") return position
    ? `@${name} you already have a level in line at #${position}. !remove takes it out.`
    : `@${name} you already have a level waiting. !remove takes it out.`;
  return `@${name} the line is full right now (${MAX_LINE} ${g.codeWord}s). Try again after a few are played.`;
}

/** "Now playing W0P-8X8-XLF from @Sam (Spin Jump Gauntlet). 3 in line." */
export function nowLine(e: { code: string; senderName: string; title?: string | null } | null, waiting: number): string {
  if (!e) return waiting ? `🎮 Nothing playing. ${waiting} in line.` : "🎮 The line is empty.";
  return `🎮 Now playing ${e.code} from @${e.senderName}${e.title ? ` (${e.title})` : ""}. ${waiting === 0 ? "Nobody else in line." : `${waiting} in line.`}`;
}

// ── The board ────────────────────────────────────────────────────────────────

export interface Play { result: LevelResult | null; streamer: string | null }

/**
 * Where a level was played and how it went, for its card on the board: "Cleared on Nova's stream", "Cleared on 2
 * streams · gave up on 1", "Played on 3 streams". Skips don't count as plays. Null = never played on stream.
 */
export function playedLine(plays: Play[]): string | null {
  const real = plays.filter((p) => p.result !== "skipped");
  if (!real.length) return null;
  const cleared = real.filter((p) => p.result === "cleared");
  const gaveUp = real.filter((p) => p.result === "gave_up").length;
  const where = (list: Play[]) => (list.length === 1 && list[0].streamer ? `${list[0].streamer}'s stream` : `${list.length} ${list.length === 1 ? "stream" : "streams"}`);
  if (cleared.length) return gaveUp ? `Cleared on ${where(cleared)} · gave up on ${gaveUp}` : `Cleared on ${where(cleared)}`;
  if (gaveUp === real.length) return `Played on ${where(real)}, not cleared yet`;
  return `Played on ${where(real)}`;
}

/** Levels newer than this read "New" on the board. */
export const NEW_DAYS = 7;

/**
 * Board sorts. With the curation tables (levels-m2): Top this week, Streamers' picks, Newest, Hardest and Lists
 * (seeds: Top this week, Newest, Lists). Before them, the first board's three: Newest, Played on stream, Hard.
 */
export type BoardSort = "top" | "streamers" | "newest" | "hardest" | "lists" | "played" | "hard";
export const BOARD_SORTS: { id: BoardSort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "played", label: "Played on stream" },
  { id: "hard", label: "Hard" },
];
const SORT_LABEL: Record<BoardSort, string> = {
  top: "Top this week", streamers: "Streamers' picks", newest: "Newest", hardest: "Hardest", lists: "Lists", played: "Played on stream", hard: "Hard",
};
/** The sort chips a board shows. */
export function boardSorts(game: LevelGame, curation: boolean): { id: BoardSort; label: string }[] {
  if (!curation) return BOARD_SORTS;
  const ids: BoardSort[] = LEVEL_GAMES[game].kind === "seed" ? ["top", "newest", "lists"] : ["top", "streamers", "newest", "hardest", "lists"];
  return ids.map((id) => ({ id, label: SORT_LABEL[id] }));
}
export const isBoardSort = (x: unknown): x is BoardSort => typeof x === "string" && x in SORT_LABEL;
const HARD_TAGS = new Set(["hard", "super hard", "kaizo", "very hard", "expert"]);
export const isHard = (tags: string[]) => tags.some((t) => HARD_TAGS.has(t.toLowerCase()));

export const TITLE_MAX = 60;
export const TAG_MAX = 20;
export const TAGS_MAX = 4;

/** A level's title as saved: spaces tidied, 1 to 60 characters, past the word filter. */
export function cleanTitle(input: unknown): { ok: true; title: string } | { ok: false; line: string } {
  const t = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, line: "Give the level its name." };
  if (t.length > TITLE_MAX) return { ok: false, line: `Keep the name to ${TITLE_MAX} characters.` };
  if (isBlockedText(t)) return { ok: false, line: "That name has words we don't allow. Try another." };
  return { ok: true, title: t };
}

/** Tags as saved: up to 4, each 1 to 20 characters, no repeats (whatever the case), past the word filter. */
export function cleanTags(input: unknown): { ok: true; tags: string[] } | { ok: false; line: string } {
  const list = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const raw of list) {
    const t = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (t.length > TAG_MAX) return { ok: false, line: `Keep each tag to ${TAG_MAX} characters.` };
    if (isBlockedText(t)) return { ok: false, line: "A tag has words we don't allow. Try another." };
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > TAGS_MAX) return { ok: false, line: `Pick up to ${TAGS_MAX} tags.` };
  return { ok: true, tags: out };
}

// ── Curation (picks 2026-11-11, "curating player levels", all as recommended) ─────────────────────────────

/** A player's mark on a level: one at a time, changeable (a like is separate). */
export type MarkOutcome = "cleared" | "gave_up" | "no_load";
export const MARK_WORD: Record<MarkOutcome, string> = { cleared: "I cleared it", gave_up: "I gave up", no_load: "The code didn't load" };
export const MARK_DONE: Record<MarkOutcome, string> = { cleared: "Cleared", gave_up: "Gave up", no_load: "Didn't load" };
export const isMarkOutcome = (x: unknown): x is MarkOutcome => x === "cleared" || x === "gave_up" || x === "no_load";

/** Difficulty reads from clears once a level has this many marks (stream results count too). */
export const MIN_MARKS = 5;
/** Two "didn't load" marks since the last clear and a level shows "May not work". */
export const NO_LOAD_FLAG = 2;
/** Top this week: likes in the last 7 days. */
export const TOP_DAYS = 7;
/** Streamers' picks: cleared on this many streams. */
export const STREAMER_CLEARS = 2;
/** GameShuffle picks per game, and their note's length. */
export const PICKS_MAX = 6;
export const PICK_NOTE_MAX = 120;
/** Lists: levels in one, title length, lists per player per game. */
export const LIST_MAX = 20;
export const LIST_TITLE_MAX = 60;
export const LISTS_PER_GAME = 20;
/** Three reports hide a level until staff look. */
export const HIDE_AT_REPORTS = 3;

/** A player's mark as the rules read it. */
export interface MarkFact { outcome: MarkOutcome | null; outcomeAt: string | null; likedAt: string | null }
/** A play on stream as the rules read it (from the level queue). */
export interface StreamFact { result: LevelResult | null; at: string }

export interface LevelStats {
  likes: number;
  likesWeek: number;
  /** Clears (marks and streams) and everyone who said how it went (cleared or gave up). */
  cleared: number;
  tried: number;
  /** Cleared ÷ tried once `tried` reaches MIN_MARKS, else null. */
  rate: number | null;
  /** Cleared on this many streams. */
  streamClears: number;
  /** Two "didn't load" marks since the last clear. */
  mayNotWork: boolean;
}

/** Everything a level's card and the sorts read, from its marks and its plays on stream. `now` in ms. */
export function levelStats(marks: MarkFact[], plays: StreamFact[], now: number = Date.now()): LevelStats {
  const weekAgo = new Date(now - TOP_DAYS * 86_400_000).toISOString();
  const likes = marks.filter((m) => m.likedAt).length;
  const likesWeek = marks.filter((m) => m.likedAt && m.likedAt >= weekAgo).length;
  const playedReal = plays.filter((p) => p.result === "cleared" || p.result === "gave_up");
  const streamClears = plays.filter((p) => p.result === "cleared").length;
  const cleared = marks.filter((m) => m.outcome === "cleared").length + streamClears;
  const tried = marks.filter((m) => m.outcome === "cleared" || m.outcome === "gave_up").length + playedReal.length;
  const lastClear = [
    ...marks.filter((m) => m.outcome === "cleared" && m.outcomeAt).map((m) => m.outcomeAt as string),
    ...plays.filter((p) => p.result === "cleared").map((p) => p.at),
  ].sort().pop() ?? "";
  const noLoads = marks.filter((m) => m.outcome === "no_load" && (m.outcomeAt ?? "") > lastClear).length;
  return { likes, likesWeek, cleared, tried, rate: tried >= MIN_MARKS ? cleared / tried : null, streamClears, mayNotWork: noLoads >= NO_LOAD_FLAG };
}

/** "Cleared by 4 of 18", or null before MIN_MARKS. */
export function clearLine(s: Pick<LevelStats, "cleared" | "tried" | "rate">): string | null {
  return s.rate == null ? null : `Cleared by ${s.cleared.toLocaleString("en-US")} of ${s.tried.toLocaleString("en-US")}`;
}

export interface SortableCard { id: string; createdAt: string; stats: LevelStats; lastPlay: string | null }

/**
 * Orders a board's cards. Top this week: likes this week (ties: all likes, then newest), only levels liked this week
 * and never one that may not work. Streamers' picks: cleared on 2 or more streams (most clears, then the latest play),
 * never one that may not work. Hardest: lowest clear rate among levels with a difficulty (ties: more players).
 * Newest: as shared. Unknown sorts read as Newest.
 */
export function sortCards<T extends SortableCard>(cards: T[], sort: BoardSort): T[] {
  const newest = (a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
  if (sort === "top") {
    return cards.filter((c) => c.stats.likesWeek > 0 && !c.stats.mayNotWork)
      .sort((a, b) => b.stats.likesWeek - a.stats.likesWeek || b.stats.likes - a.stats.likes || newest(a, b));
  }
  if (sort === "streamers") {
    return cards.filter((c) => c.stats.streamClears >= STREAMER_CLEARS && !c.stats.mayNotWork)
      .sort((a, b) => b.stats.streamClears - a.stats.streamClears || (b.lastPlay ?? "").localeCompare(a.lastPlay ?? "") || newest(a, b));
  }
  if (sort === "hardest") {
    return cards.filter((c) => c.stats.rate != null)
      .sort((a, b) => (a.stats.rate as number) - (b.stats.rate as number) || b.stats.tried - a.stats.tried || newest(a, b));
  }
  return [...cards].sort(newest);
}

/** The week a level of the week belongs to: the Pacific Monday ("YYYY-MM-DD") of `day`. */
export function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - back * 86_400_000).toISOString().slice(0, 10);
}

/** Reasons a level can be reported for, and the report reason each files under (Platform ▸ Moderation). */
export const LEVEL_REPORTS = [
  { id: "wrong_game", label: "Wrong game, or not a level", reason: "other" },
  { id: "offensive", label: "Offensive name, tags or note", reason: "hate_harassment" },
  { id: "spam", label: "Spam", reason: "spam" },
] as const;
export type LevelReportId = (typeof LEVEL_REPORTS)[number]["id"];
export const isLevelReport = (x: unknown): x is LevelReportId => LEVEL_REPORTS.some((r) => r.id === x);

/** A GameShuffle pick's note as saved: one line, 1 to 120 characters, past the word filter. */
export function cleanPickNote(input: unknown): { ok: true; note: string } | { ok: false; line: string } {
  const t = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, line: "Add a line on why it's a pick." };
  if (t.length > PICK_NOTE_MAX) return { ok: false, line: `Keep the note to ${PICK_NOTE_MAX} characters.` };
  if (isBlockedText(t)) return { ok: false, line: "That note has words we don't allow." };
  return { ok: true, note: t };
}

/** A list's title as saved. */
export function cleanListTitle(input: unknown): { ok: true; title: string } | { ok: false; line: string } {
  const t = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, line: "Give the list a name." };
  if (t.length > LIST_TITLE_MAX) return { ok: false, line: `Keep the name to ${LIST_TITLE_MAX} characters.` };
  if (isBlockedText(t)) return { ok: false, line: "That name has words we don't allow. Try another." };
  return { ok: true, title: t };
}

// ── Seeds (Minecraft) ────────────────────────────────────────────────────────

export type SeedEdition = "java" | "bedrock";
export const EDITION_WORD: Record<SeedEdition, string> = { java: "Java", bedrock: "Bedrock" };
export const isEdition = (x: unknown): x is SeedEdition => x === "java" || x === "bedrock";
export const NOTE_MAX = 280;
export const SPOTS_MAX = 5;

/** A place worth seeing in a seed's world. */
export interface SeedSpot { label: string; x: number; y: number | null; z: number }

/** A Minecraft version as typed ("1.21.4", "1.20"), or null. */
export function cleanVersion(input: unknown): { ok: true; version: string } | { ok: false; line: string } {
  const t = String(input ?? "").trim().replace(/^v/i, "");
  if (!/^1\.\d{1,2}(\.\d{1,2})?$/.test(t)) return { ok: false, line: "Add the version, like 1.21.4." };
  return { ok: true, version: t };
}

/** A seed's note: up to 280 characters, past the word filter (empty is fine). */
export function cleanNote(input: unknown): { ok: true; note: string | null } | { ok: false; line: string } {
  const t = String(input ?? "").replace(/[ \t]+/g, " ").trim();
  if (!t) return { ok: true, note: null };
  if (t.length > NOTE_MAX) return { ok: false, line: `Keep the note to ${NOTE_MAX} characters.` };
  if (isBlockedText(t)) return { ok: false, line: "The note has words we don't allow." };
  return { ok: true, note: t };
}

const COORD = 30_000_000;
/** Places worth seeing: up to 5, each a label (1 to 40 characters) and whole-number X and Z inside the world border
 *  (Y optional, -64 to 320). Rows left empty are dropped. */
export function cleanSpots(input: unknown): { ok: true; spots: SeedSpot[] } | { ok: false; line: string } {
  const rows = Array.isArray(input) ? input : [];
  const out: SeedSpot[] = [];
  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const label = String(r.label ?? "").replace(/\s+/g, " ").trim();
    const blank = (v: unknown) => v == null || String(v).trim() === "";
    if (!label && blank(r.x) && blank(r.z) && blank(r.y)) continue;
    if (!label || label.length > 40) return { ok: false, line: "Give each place a short name (up to 40 characters)." };
    if (isBlockedText(label)) return { ok: false, line: "A place's name has words we don't allow." };
    if (blank(r.x) || blank(r.z)) return { ok: false, line: `Give ${label} its X and Z as whole numbers.` };
    const x = Number(r.x), z = Number(r.z);
    const y = blank(r.y) ? null : Number(r.y);
    if (!Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > COORD || Math.abs(z) > COORD) return { ok: false, line: `Give ${label} its X and Z as whole numbers.` };
    if (y != null && (!Number.isInteger(y) || y < -64 || y > 320)) return { ok: false, line: `${label}'s Y goes from -64 to 320.` };
    out.push({ label, x, y, z });
  }
  if (out.length > SPOTS_MAX) return { ok: false, line: `Up to ${SPOTS_MAX} places.` };
  return { ok: true, spots: out };
}

/** "X 120, Y 64, Z -340" */
export const spotLine = (s: SeedSpot) => `X ${s.x}${s.y != null ? `, Y ${s.y}` : ""}, Z ${s.z}`;
