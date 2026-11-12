/**
 * Head-to-head rooms' rules (speedrun races picks 2026-11-10): who's ahead, by how much, whether a runner can start,
 * and the final places. Pure and client-safe: the race page, the overlay, the restream link, the webhook and the
 * Discord posts all rank the same way.
 *
 * Ranking (pick 3A, splits compared one by one): everyone who finished, fastest first; then everyone still going,
 * furthest first, and at the same split whoever got there in less time on their own clock; then anyone out (a reset
 * forfeits, pick 4A), with no place. Gaps compare the same checkpoint: Sam reached Lost 12.7 after Nova. A lane
 * behind the leader's checkpoint shows where its gap was measured ("+25.6 at Cloud").
 */

import { fmtClock, fmtDelta } from "@/lib/speedrun/time";
import type { BattleGroup, Lane, LaneLive, OutReason, RoomEntrant, RoomUnit, RoomView, TeamScore, VersusSettings } from "./types";

export const VERSUS_MIN = 2;
export const VERSUS_MAX = 8;
/** GameShuffle starts every timer at the end of this countdown (pick 2A). */
export const COUNTDOWN_S = 10;
export const CODE_RE = /^[A-Z0-9]{2,4}-[A-Z0-9]{3}$/;
/** No I, O, 0 or 1: a code is read out on stream. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** One color per seat, readable on the overlay's dark panel and the page. */
export const LANE_COLORS = ["#6d5bff", "#0e9fb8", "#e8692c", "#d83b8a", "#2f9e5b", "#c9a227", "#7c8bff", "#e2525c"] as const;
export const laneColor = (seat: number): string => LANE_COLORS[(Math.max(1, seat) - 1) % LANE_COLORS.length];

export function cleanVersusSettings(raw: unknown): VersusSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const max = typeof r.max === "number" && Number.isInteger(r.max) ? Math.min(VERSUS_MAX, Math.max(VERSUS_MIN, r.max)) : 4;
  const out: VersusSettings = { join: r.join === "invite" ? "invite" : "link", max, bets: r.bets === true };
  const d = r.duel as Record<string, unknown> | undefined;
  if (d && typeof d.trainerId === "string" && /^[a-z0-9-]{2,60}$/.test(d.trainerId) && typeof d.month === "string" && /^\d{4}-\d{2}-01$/.test(d.month)) {
    out.duel = { trainerId: d.trainerId, month: d.month, level: d.level === "easy" || d.level === "hard" ? d.level : "normal" };
  }
  const seed = typeof r.seed === "string" ? cleanSeed(r.seed) : null;
  if (seed) out.seed = seed;
  const tm = r.teams as Record<string, unknown> | undefined;
  if (tm && typeof tm.count === "number" && Number.isInteger(tm.count) && tm.count >= 2 && tm.count <= 4) {
    out.teams = { count: Math.min(tm.count, out.max), score: tm.score === "best" ? "best" : "total" };
  }
  const b = r.battle as Record<string, unknown> | undefined;
  if (b && typeof b.group === "string" && isBattleGroup(b.group)) {
    out.battle = { group: b.group };
    // A trainer battle is one against one.
    out.max = 2;
    delete out.teams;
  }
  return out;
}

/** Trainer battles' groups (battle picks 1A): both players pick a team from the same one. */
export const BATTLE_GROUPS: readonly { id: BattleGroup; label: string; one: string }[] = [
  { id: "gym", label: "Gym Leaders", one: "a Gym Leader" },
  { id: "elite", label: "Elite Four", one: "an Elite Four member" },
  { id: "rival", label: "Rivals", one: "a rival" },
  { id: "boss", label: "Bosses", one: "a boss" },
  { id: "champion", label: "Champions", one: "a Champion" },
];
export const isBattleGroup = (g: string): g is BattleGroup => BATTLE_GROUPS.some((x) => x.id === g);
export const battleGroupLabel = (g: BattleGroup) => BATTLE_GROUPS.find((x) => x.id === g)?.label ?? "Teams";

/** A typed seed, tidied: a number, or up to 32 letters, digits, spaces and dashes (the game hashes text). */
export function cleanSeed(raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim();
  return /^[A-Za-z0-9 _-]{1,32}$/.test(s) ? s : null;
}

/** The game a race can share a seed in (roster pick 11). */
export const SEED_GAMES = new Set(["minecraft"]);

/** How a kind of room ranks: a duel or a battle places everyone who lost after the winners (by how far they got); a
 *  speedrun gives anyone out no place. */
export const rankFor = (kind: string) => ({ placeLost: kind === "duel" || kind === "battle" || kind === "tag" });

/** A lane's value as the room counts it: a time ("1:01:58.2") or turns ("8 turns"). */
export function fmtValue(v: number | null | undefined, unit: RoomUnit): string {
  if (v == null) return "";
  return unit === "turns" ? `${v} ${v === 1 ? "turn" : "turns"}` : fmtClock(v);
}

/** A gap without its sign: "12.7" or "1 turn". */
export function fmtGap(v: number, unit: RoomUnit): string {
  return unit === "turns" ? `${v} ${v === 1 ? "turn" : "turns"}` : fmtDelta(v);
}

/** A room's link code: the game's initials, then three characters ("SMO-4KQ"). `rand` gives 0 <= n < 1. */
export function roomCode(game: string | null, rand: () => number = Math.random): string {
  const words = (game ?? "").normalize("NFKD").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let prefix = words.map((w) => w[0].toUpperCase()).join("").slice(0, 3);
  if (prefix.length < 2) prefix = (words[0] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  if (prefix.length < 2) prefix = "GS";
  const tail = Array.from({ length: 3 }, () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length]).join("");
  return `${prefix}-${tail}`;
}

/** The code as typed or linked, tidied ("smo-4kq" → "SMO-4KQ"), or null. */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  return CODE_RE.test(s) ? s : null;
}

// ---- Can this runner start? ----------------------------------------------------------------------------------

export type ReadyProblem = "not_connected" | "no_control" | "splits" | "not_at_zero";

export interface ReadyCheck {
  /** GameShuffle can start this timer at Go. */
  ok: boolean;
  /** The timer, then the splits: "LiveSplit connected · 17 splits". */
  line: string;
  problem: ReadyProblem | null;
}

/** Whether a speedrun lane can be started at Go: a timer GameShuffle may start, the room's split count, at 0:00. */
export function speedrunReadiness(live: LaneLive | null, needs: number): ReadyCheck {
  const timer = !live
    ? "Timer not connected"
    : live.connected
      ? live.mode === "addon" ? "LiveSplit connected" : "LiveSplit One connected"
      : live.remotes > 0 ? "Phone remote" : "Timer not connected";
  const count = live?.count ?? 0;
  const splits = count === needs ? `${needs} splits` : `${count} split${count === 1 ? "" : "s"} (needs ${needs})`;
  const line = `${timer} · ${splits}`;
  if (!live || (!live.connected && live.remotes === 0)) return { ok: false, line, problem: "not_connected" };
  if (!live.canStart) return { ok: false, line, problem: "no_control" };
  if (count !== needs) return { ok: false, line, problem: "splits" };
  if (live.phase !== "idle") return { ok: false, line, problem: "not_at_zero" };
  return { ok: true, line, problem: null };
}

export const READY_HELP: Record<ReadyProblem, string> = {
  not_connected: "Connect your timer on the speedrun page, or open the phone remote.",
  no_control: "In GameShuffle for LiveSplit's settings, let GameShuffle start and split your timer.",
  splits: "Your splits need the same count as the race's. Change them on the speedrun page.",
  not_at_zero: "Reset your timer to 0:00. GameShuffle starts it at Go.",
};

// ---- Standings -------------------------------------------------------------------------------------------

export interface StandingRow {
  key: string;
  /** 1-based for anyone finished or still going; null for anyone out or not started. */
  place: number | null;
  status: Lane["status"];
  reached: number;
  /** The checkpoint this row is compared at (its last split, or the last one when done), or null before any. */
  at: number | null;
  /** Its time at `at` (the final time when done). */
  timeMs: number | null;
  /** Behind the fastest lane at the same checkpoint; null for that lane, or with nothing to compare. */
  gapMs: number | null;
  /** Set when the gap was measured at an earlier checkpoint than the leader's ("at Cloud"). */
  gapAt: number | null;
  leader: boolean;
  outReason: OutReason | null;
  outAt: number | null;
}

/** The last checkpoint with a time, at or before `upTo`. */
function lastTimed(times: readonly (number | null)[], upTo: number): number | null {
  for (let i = Math.min(upTo, times.length - 1); i >= 0; i--) if (times[i] != null) return i;
  return null;
}

function compareAt(lane: Lane, n: number): number | null {
  if (lane.status === "done") return n > 0 ? lastTimed(lane.times, n - 1) : null;
  if (lane.status === "out") return lane.outAt ? lastTimed(lane.times, lane.outAt - 1) : null;
  return lane.reached > 0 ? lastTimed(lane.times, lane.reached - 1) : null;
}

/** Finished, still going, lost (a duel: placed), out another way, not started. */
const rankOf = (l: Lane, placeLost: boolean) => (l.status === "done" ? 0 : l.status === "running" ? 1 : l.status === "out" ? (placeLost && l.outReason === "lost" ? 2 : 3) : 4);

/** The room's standings, best first. `n` = the room's checkpoint count. */
export function standings(entrants: readonly { key: string; lane: Lane }[], n: number, opts: { placeLost?: boolean } = {}): StandingRow[] {
  const placeLost = opts.placeLost === true;
  const rows = entrants.map(({ key, lane }) => {
    const at = compareAt(lane, n);
    const timeMs = lane.status === "done" ? lane.finalMs ?? (at != null ? lane.times[at] : null) : at != null ? lane.times[at] ?? null : null;
    return { key, lane, at, timeMs };
  });
  const tie = (a: (typeof rows)[number], b: (typeof rows)[number]) => (a.lane.tieMs ?? Infinity) - (b.lane.tieMs ?? Infinity);
  rows.sort((a, b) => {
    const r = rankOf(a.lane, placeLost) - rankOf(b.lane, placeLost);
    if (r) return r;
    if (a.lane.status === "done") return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || tie(a, b);
    if (a.lane.status === "running") {
      if (b.lane.reached !== a.lane.reached) return b.lane.reached - a.lane.reached;
      return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity);
    }
    if (a.lane.status === "out") {
      if ((b.lane.outAt ?? 0) !== (a.lane.outAt ?? 0)) return (b.lane.outAt ?? 0) - (a.lane.outAt ?? 0);
      return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || tie(a, b);
    }
    return 0;
  });
  // The fastest time at each checkpoint, among everyone who has one there.
  const best = new Map<number, number>();
  for (const { lane } of rows) {
    lane.times.forEach((t, i) => {
      if (t != null && (!best.has(i) || t < best.get(i)!)) best.set(i, t);
    });
    if (lane.status === "done" && n > 0 && lane.finalMs != null) {
      const i = n - 1;
      if (!best.has(i) || lane.finalMs < best.get(i)!) best.set(i, lane.finalMs);
    }
  }
  const leadAt = rows[0]?.at ?? null;
  let place = 0;
  return rows.map((r, i) => {
    const placed = r.lane.status === "done" || r.lane.status === "running" || (placeLost && r.lane.status === "out" && r.lane.outReason === "lost");
    const fastest = r.at != null ? best.get(r.at) ?? null : null;
    const gapMs = r.at != null && r.timeMs != null && fastest != null && i > 0 ? Math.max(0, r.timeMs - fastest) : null;
    return {
      key: r.key,
      place: placed ? ++place : null,
      status: r.lane.status,
      reached: r.lane.reached,
      at: r.at,
      timeMs: r.timeMs,
      gapMs,
      gapAt: gapMs != null && leadAt != null && r.at != null && r.at < leadAt ? r.at : null,
      leader: i === 0 && placed,
      outReason: r.lane.outReason,
      outAt: r.lane.outAt,
    };
  });
}

export interface FinalResult {
  userId: string;
  place: number | null;
  finalMs: number | null;
  reached: number;
  outAt: number | null;
  outReason: OutReason | null;
}

/** The finished room's places (finishers place; in a duel, everyone who lost does too, after the winners; the rest are
 *  listed by how far they got). */
export function finalResults(view: RoomView): FinalResult[] {
  const opts = rankFor(view.kind);
  const rows = standings(view.entrants, view.checkpoints.length, opts);
  return rows.map((r) => {
    const lane = view.entrants.find((e) => e.key === r.key)!.lane;
    return {
      userId: r.key,
      place: r.status === "done" || (opts.placeLost && r.outReason === "lost") ? r.place : null,
      finalMs: r.status === "done" ? r.timeMs : null,
      reached: lane.reached,
      outAt: lane.outAt,
      outReason: lane.outReason,
    };
  });
}

/** Why someone stopped, in a few words ("Forfeited at Sand", "Left after 3 splits"). */
export function outLine(reason: OutReason | null, outAt: number | null, checkpoints: readonly string[], plain: (s: string) => string = (s) => s): string {
  const where = outAt != null && outAt > 0 && checkpoints[outAt] ? ` at ${plain(checkpoints[outAt])}` : outAt === 0 && checkpoints[0] ? ` at ${plain(checkpoints[0])}` : "";
  switch (reason) {
    case "reset": return `Forfeited${where}`;
    case "left": return `Left${where}`;
    case "removed": return `Taken out${where}`;
    case "timeout": return `Time ran out${where}`;
    case "ended": return `Race ended${where}`;
    case "nostart": return "Timer didn't start";
    case "lost": return `Lost${where}`;
    default: return "Out";
  }
}

/** When "Who wins?" bets lock: once the leader is this many checkpoints in (a quarter of the way, like the PB bet). */
export function betLockAt(n: number): number {
  if (n < 2) return 1;
  return Math.min(n - 1, Math.max(1, Math.ceil(n / 4)));
}

/** A lane's clock at a moment of the room's clock (`serverNow`): ticking while running, still otherwise. */
export function laneClockMs(lane: Lane, serverNow: number): number | null {
  if (lane.status === "done") return lane.finalMs;
  const live = lane.live;
  if (!live) return null;
  if (live.phase === "running") return Math.max(0, live.elapsedMs + (serverNow - live.at));
  if (lane.status === "waiting" && live.phase === "idle") return 0;
  return live.elapsedMs;
}

/** The entrants as they stood `delayMs` ago, for watchers (each lane after its runner's stream delay, pick 5A). */
export interface LaneMoment { at: number; entrant: RoomEntrant }
export function laneAsOf(history: readonly LaneMoment[], serverNow: number, delayMs: number): RoomEntrant | null {
  const cut = serverNow - delayMs;
  let pick: RoomEntrant | null = null;
  for (const m of history) {
    if (m.at <= cut) pick = m.entrant;
    else break;
  }
  return pick ?? history[0]?.entrant ?? null;
}

// ---- "Who wins?" bets (pick 8A) ---------------------------------------------------------------------------

export interface BetOption { option_key: string; label: string; key: string }

/** One option per runner, keyed by a name chat can type ("!bet nova 100"); seat numbers work too (`matchBetOption`). */
export function raceBetOptions(entrants: readonly { key: string; name: string }[]): BetOption[] {
  const used = new Set<string>();
  return entrants.map((e, i) => {
    let k = e.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || `r${i + 1}`;
    if (used.has(k)) k = `${k.slice(0, 18)}${i + 1}`;
    used.add(k);
    return { option_key: k, label: e.name, key: e.key };
  });
}

/** What chat typed, as an option key: the name (any case, "@" and spaces ignored) or the runner's number. */
export function matchBetOption(options: readonly { option_key: string }[], typed: string | undefined): string | null {
  const t = (typed ?? "").normalize("NFKD").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
  if (!t) return null;
  if (/^[1-8]$/.test(t) && options[Number(t) - 1]) return options[Number(t) - 1].option_key;
  return options.find((o) => o.option_key === t)?.option_key ?? null;
}

// ---- Team races (co-op pick 6) ------------------------------------------------------------------------------------

export interface TeamRow {
  team: number;
  /** Members' keys, best first. */
  members: string[];
  place: number | null;
  /** The team's score: the total of its members' results, or its best member's (a time in ms, or turns). */
  value: number | null;
  /** Members who finished (done), and how many there are. */
  finished: number;
  size: number;
  /** Still going: some member is still running. */
  running: boolean;
}

/**
 * Team standings from the individual standings: a team's total needs every member to finish (a team with someone out
 * has no total and goes after the teams that finished, by how many did); a team's best is its fastest finisher. Teams
 * still running sit between the finished teams and the rest. Ties share a place.
 */
export function teamStandings(rows: readonly StandingRow[], teamOf: (key: string) => number | null | undefined, score: TeamScore): TeamRow[] {
  const by = new Map<number, StandingRow[]>();
  for (const r of rows) {
    const t = teamOf(r.key);
    if (!t) continue;
    by.set(t, [...(by.get(t) ?? []), r]);
  }
  const teams: TeamRow[] = [...by.entries()].map(([team, members]) => {
    const done = members.filter((m) => m.status === "done" && m.timeMs != null);
    const running = members.some((m) => m.status === "running" || m.status === "waiting");
    let value: number | null = null;
    if (score === "best") value = done.length ? Math.min(...done.map((m) => m.timeMs!)) : null;
    else if (done.length === members.length && members.length) value = done.reduce((n, m) => n + m.timeMs!, 0);
    return { team, members: members.map((m) => m.key), place: null, value, finished: done.length, size: members.length, running };
  });
  const rank = (t: TeamRow) => (t.value != null && !(score === "total" && t.running) ? 0 : t.running ? 1 : 2);
  teams.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.value! - b.value! : b.finished - a.finished) || a.team - b.team);
  let place = 0;
  let prev: TeamRow | null = null;
  for (const t of teams) {
    if (rank(t) !== 0) break;
    place = prev && prev.value === t.value ? place : place + 1;
    t.place = place;
    prev = t;
  }
  return teams;
}
