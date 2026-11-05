/**
 * The ban and protect track draft (Summer Series pick 5A and 6A). Pure and client-safe.
 *
 * Teams take turns in a snake order (round 1 as set, round 2 reversed, and so on). Each turn bans one open
 * track and protects one: a protected track can't be banned later and is in the pool. The draft stops when
 * the bank is down to its target (48 tracks to 24: 24 turns, four per team with six teams), and the pool is
 * every track that wasn't banned. A turn that runs out of time is picked at random. State lives in
 * `gs_series_nights.draft`, written with `draft_version` as the check (src/lib/series/draftStore.ts).
 */

export type DraftStatus = "setup" | "running" | "paused" | "done";

export interface DraftTurn {
  team: string;
  ban: string;
  protect: string | null;
  at: string;
  /** The account that locked it in (a player or an organizer); null when time ran out. */
  by: string | null;
  auto: boolean;
}

export interface DraftState {
  status: DraftStatus;
  bank: string[];
  target: number;
  /** Round 1's order (team ids). */
  order: string[];
  turns: DraftTurn[];
  turnSeconds: number;
  turnStartedAt: string | null;
  /** Seconds left on the turn when it was paused. */
  pausedLeft: number | null;
  /** When the order was last rolled (the overlay and board play the roll). */
  rolledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export const DEFAULT_TURN_SECONDS = 60;
export const DEFAULT_TARGET = 24;
/** Time on top of the clock before a turn is picked at random (stream delay, a tap in flight). */
export const AUTO_GRACE_MS = 2000;

export function emptyDraft(bank: string[], target = DEFAULT_TARGET, turnSeconds = DEFAULT_TURN_SECONDS): DraftState {
  return {
    status: "setup", bank: [...bank], target: clampTarget(target, bank.length), order: [], turns: [],
    turnSeconds: clampSeconds(turnSeconds), turnStartedAt: null, pausedLeft: null, rolledAt: null, startedAt: null, finishedAt: null,
  };
}

function clampTarget(target: number, bankSize: number): number {
  const t = Math.round(Number(target) || DEFAULT_TARGET);
  return Math.max(1, Math.min(t, Math.max(1, bankSize - 1)));
}
function clampSeconds(s: number): number {
  const n = Math.round(Number(s) || DEFAULT_TURN_SECONDS);
  return Math.max(15, Math.min(n, 600));
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

/** A stored draft (or nothing) as a whole DraftState. */
export function readDraft(raw: unknown): DraftState | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bank = strs(r.bank);
  if (!bank.length) return null;
  const status = (["setup", "running", "paused", "done"] as const).includes(r.status as DraftStatus) ? (r.status as DraftStatus) : "setup";
  const turns = (Array.isArray(r.turns) ? r.turns : []).flatMap((t): DraftTurn[] => {
    const x = (t ?? {}) as Record<string, unknown>;
    const team = str(x.team), ban = str(x.ban);
    if (!team || !ban) return [];
    return [{ team, ban, protect: str(x.protect), at: str(x.at) ?? new Date(0).toISOString(), by: str(x.by), auto: x.auto === true }];
  });
  return {
    status, bank, target: clampTarget(Number(r.target), bank.length), order: strs(r.order), turns,
    turnSeconds: clampSeconds(Number(r.turnSeconds)), turnStartedAt: str(r.turnStartedAt),
    pausedLeft: typeof r.pausedLeft === "number" ? r.pausedLeft : null,
    rolledAt: str(r.rolledAt), startedAt: str(r.startedAt), finishedAt: str(r.finishedAt),
  };
}

export function totalTurns(d: Pick<DraftState, "bank" | "target">): number {
  return Math.max(0, d.bank.length - d.target);
}

/** The team whose turn number `i` (from 0) is, in a snake order. */
export function teamForTurn(order: string[], i: number): string | null {
  const n = order.length;
  if (!n || i < 0) return null;
  const round = Math.floor(i / n);
  const pos = i % n;
  return round % 2 === 0 ? order[pos] : order[n - 1 - pos];
}

/** Every turn's team, in order. */
export function turnTeams(d: Pick<DraftState, "order" | "bank" | "target">): string[] {
  const total = totalTurns(d);
  const out: string[] = [];
  for (let i = 0; i < total; i++) { const t = teamForTurn(d.order, i); if (t) out.push(t); }
  return out;
}

export function onClock(d: DraftState): string | null {
  if (d.status !== "running" && d.status !== "paused") return null;
  if (d.turns.length >= totalTurns(d)) return null;
  return teamForTurn(d.order, d.turns.length);
}

export function bannedSet(d: Pick<DraftState, "turns">): Set<string> {
  return new Set(d.turns.map((t) => t.ban));
}
export function protectedSet(d: Pick<DraftState, "turns">): Set<string> {
  return new Set(d.turns.flatMap((t) => (t.protect ? [t.protect] : [])));
}

/** Tracks that can still be banned or protected, in bank order. */
export function openTracks(d: Pick<DraftState, "bank" | "turns">): string[] {
  const banned = bannedSet(d), prot = protectedSet(d);
  return d.bank.filter((id) => !banned.has(id) && !prot.has(id));
}

/** The tracks races can be on: everything not banned (when the draft is done, that's the target's worth). */
export function draftPool(d: Pick<DraftState, "bank" | "turns">): string[] {
  const banned = bannedSet(d);
  return d.bank.filter((id) => !banned.has(id));
}

/** When the turn on the clock runs out (ms since epoch), or null. */
export function turnDeadline(d: DraftState): number | null {
  if (d.status !== "running" || !d.turnStartedAt || !onClock(d)) return null;
  return Date.parse(d.turnStartedAt) + d.turnSeconds * 1000;
}

export function secondsLeft(d: DraftState, now = Date.now()): number | null {
  if (d.status === "paused") return d.pausedLeft;
  const end = turnDeadline(d);
  return end == null ? null : Math.max(0, Math.ceil((end - now) / 1000));
}

/** Whether a protect is needed this turn: only when a track would be left open after the ban. */
export function protectNeeded(d: Pick<DraftState, "bank" | "turns">): boolean {
  return openTracks(d).length >= 2;
}

export type DraftError = "not_running" | "not_your_turn" | "bad_ban" | "bad_protect" | "same_track" | "protect_needed";

export const DRAFT_ERRORS: Record<DraftError, string> = {
  not_running: "The draft isn't running right now.",
  not_your_turn: "It isn't your team's turn.",
  bad_ban: "That track can't be banned. Pick an open track.",
  bad_protect: "That track can't be protected. Pick an open track.",
  same_track: "Ban one track and protect a different one.",
  protect_needed: "Pick a track to protect too.",
};

export function checkPick(d: DraftState, team: string, ban: string, protect: string | null): DraftError | null {
  if (d.status !== "running") return "not_running";
  if (onClock(d) !== team) return "not_your_turn";
  const open = new Set(openTracks(d));
  if (!open.has(ban)) return "bad_ban";
  if (protect != null) {
    if (protect === ban) return "same_track";
    if (!open.has(protect)) return "bad_protect";
  } else if (protectNeeded(d)) return "protect_needed";
  return null;
}

/** The draft after a turn (call checkPick first). */
export function applyPick(d: DraftState, team: string, ban: string, protect: string | null, by: string | null, auto: boolean, now = new Date()): DraftState {
  const at = now.toISOString();
  const turns = [...d.turns, { team, ban, protect: protectNeeded(d) ? protect : null, at, by, auto }];
  const done = turns.length >= totalTurns(d);
  return { ...d, turns, status: done ? "done" : "running", turnStartedAt: done ? null : at, finishedAt: done ? at : null, pausedLeft: null };
}

/** A small seeded random (mulberry32), so a timed-out turn picks the same thing on every server that reads it. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a timed-out turn bans and protects: two different open tracks at random. */
export function randomPick(d: DraftState, seed: string): { ban: string; protect: string | null } | null {
  const open = openTracks(d);
  if (!open.length) return null;
  const rand = seeded(seed);
  const ban = open[Math.floor(rand() * open.length)];
  const rest = open.filter((id) => id !== ban);
  const protect = rest.length && protectNeeded(d) ? rest[Math.floor(rand() * rest.length)] : null;
  return { ban, protect };
}

/** Whether the turn on the clock has run out (with the grace). */
export function timedOut(d: DraftState, now = Date.now()): boolean {
  const end = turnDeadline(d);
  return end != null && now > end + AUTO_GRACE_MS;
}

/** Shuffle for the order roll. */
export function shuffled<T>(list: T[], rand: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** An order from a night's standings: last place goes first (pick 6A). */
export function orderFromStandings(bestFirst: string[]): string[] {
  return [...bestFirst].reverse();
}

export function startDraft(d: DraftState, now = new Date()): DraftState {
  const at = now.toISOString();
  return { ...d, status: totalTurns(d) > 0 ? "running" : "done", turnStartedAt: at, startedAt: d.startedAt ?? at, pausedLeft: null };
}

export function pauseDraft(d: DraftState, now = Date.now()): DraftState {
  if (d.status !== "running") return d;
  return { ...d, status: "paused", pausedLeft: secondsLeft(d, now), turnStartedAt: null };
}

export function resumeDraft(d: DraftState, now = Date.now()): DraftState {
  if (d.status !== "paused") return d;
  const left = d.pausedLeft ?? d.turnSeconds;
  return { ...d, status: "running", turnStartedAt: new Date(now - (d.turnSeconds - left) * 1000).toISOString(), pausedLeft: null };
}

/** Takes back the last turn; that team is on the clock again with a full clock. */
export function undoTurn(d: DraftState, now = new Date()): DraftState {
  if (!d.turns.length) return d;
  return { ...d, turns: d.turns.slice(0, -1), status: "running", turnStartedAt: now.toISOString(), finishedAt: null, pausedLeft: null };
}

/** The order is valid when it holds each of the series' teams once. */
export function orderValid(order: string[], teamIds: string[]): boolean {
  return order.length === teamIds.length && new Set(order).size === order.length && order.every((t) => teamIds.includes(t));
}
