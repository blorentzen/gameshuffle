/**
 * Speedrun words for chat and the prediction (step 2, approved mockup screen 6): `!pb`, `!pace` and `!splits` from the
 * run's own numbers, the prediction's open / lock / settle lines, and the prediction tally as the overlay, the phone
 * remote and the live page show it. Emoji only in chat lines. Pure and client-safe; tests in scripts/test-speedrun.ts.
 */

import { shownState } from "./splitGroups";
import { fmtClock, fmtDelta } from "./time";
import { currentIndex, deltas, isNewPb, lastDelta, pace, pbTime, sumOfBest } from "./rules";
import type { RelaySegment, RelayState, SpeedrunPredictionView } from "./types";

/** Twitch allows 500 characters; a little room for safety. */
export const CHAT_MAX = 480;

const tokens = (n: number) => n.toLocaleString("en-US");
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
/** "Mario Kart 8 Deluxe, 48 Tracks · 150cc" (or just one of them). */
const runName = (game: string, category: string) => [game, category].filter(Boolean).join(", ");

/** `!pb`: "🏆 Nova's PB in Mario Kart 8 Deluxe, 48 Tracks: 1:40:24.1, set Nov 2. Sum of best: 1:39:17.8." */
export function pbLine(o: { name: string; game: string; category: string; segments: RelaySegment[]; sobMs: number | null; setOn: string | null }): string {
  const where = runName(o.game, o.category);
  const pb = pbTime(o.segments);
  const sob = o.sobMs != null ? ` Sum of best: ${fmtClock(o.sobMs)}.` : "";
  if (!o.segments.length) return `🏆 No splits from ${o.name} yet.`;
  if (pb == null) return `🏆 ${o.name} hasn't finished a run${where ? ` of ${where}` : ""} yet.${sob}`;
  return `🏆 ${o.name}'s PB${where ? ` in ${where}` : ""}: ${fmtClock(pb)}${o.setOn ? `, set ${o.setOn}` : ""}.${sob}`;
}

/** `!pace`: where the run stands against the PB and where it's heading. */
export function paceLine(raw: RelayState): string {
  const st = shownState(raw);
  const n = st.segments.length;
  const pb = pbTime(st.segments);
  if (!n) return "⏱️ No splits yet.";
  if (st.phase === "idle") return pb != null ? `⏱️ No run going right now. PB: ${fmtClock(pb)}.` : "⏱️ No run going right now.";
  if (st.phase === "ended") {
    const end = st.splits[n - 1];
    if (end == null) return "⏱️ The run is over.";
    if (pb == null) return `⏱️ Finished in ${fmtClock(end)}.`;
    return isNewPb(st) ? `⏱️ Finished in ${fmtClock(end)}, a new PB by ${fmtDelta(pb - end)}.` : `⏱️ Finished in ${fmtClock(end)}, ${fmtDelta(end - pb)} behind the PB.`;
  }
  const d = lastDelta(st);
  const cur = st.segments[currentIndex(st) ?? 0]?.name ?? "";
  const paused = st.phase === "paused" ? " (paused)" : "";
  if (!d) return pb != null ? `⏱️ On ${cur}${paused}. PB pace: ${fmtClock(pb)}.` : `⏱️ On ${cur}${paused}. No PB yet to compare with.`;
  const where = st.segments[d.index]?.name ?? "";
  const side = d.ms <= 0 ? "ahead of" : "behind";
  const heading = pace(st);
  return `⏱️ ${where} done, ${fmtDelta(d.ms)} ${side} PB${paused}. On pace for ${fmtClock(heading)} if the rest matches the PB.`;
}

/** `!splits`: "📋 Mushroom ▼2.3 · Flower ▲1.0 · Star ▼7.3 ⭐ · … · now Lightning". Long runs keep the latest that fit. */
export function splitsLine(raw: RelayState): string {
  const st = shownState(raw);
  const n = st.segments.length;
  if (!n) return "📋 No splits yet.";
  if (st.phase === "idle") return "📋 No run going right now.";
  const cur = currentIndex(st) ?? 0;
  const d = deltas(st);
  const parts: string[] = [];
  for (let i = 0; i < Math.min(cur, n); i++) {
    const name = st.segments[i].name;
    const t = st.splits[i];
    if (t == null) { parts.push(`${name} skipped`); continue; }
    const delta = d[i];
    const mark = delta == null ? fmtClock(t) : `${delta <= 0 ? "▼" : "▲"}${fmtDelta(delta)}`;
    parts.push(`${name} ${mark}${st.golds[i] ? " ⭐" : ""}`);
  }
  const tail = st.phase === "ended" ? `finished ${fmtClock(st.splits[n - 1] ?? st.elapsedMs)}` : `now ${st.segments[cur]?.name ?? ""}`;
  if (!parts.length) return `📋 No splits yet this run · ${tail}`;
  const join = (xs: string[], cut: boolean) => `📋 ${cut ? "… · " : ""}${[...xs, tail].join(" · ")}`;
  let from = 0;
  while (from < parts.length - 1 && join(parts.slice(from), from > 0).length > CHAT_MAX) from++;
  const line = join(parts.slice(from), from > 0);
  return line.length > CHAT_MAX ? `${line.slice(0, CHAT_MAX - 1)}…` : line;
}

/** Sum of best for `!pb` from the run alone (no live run in it). */
export const sobOf = (segments: RelaySegment[]): number | null => sumOfBest({
  v: 1, seq: 0, connected: false, phase: "idle", index: null, elapsedMs: 0, at: 0, game: null, category: null, attempt: 0,
  segments, splits: segments.map(() => null), golds: segments.map(() => false), last: null,
});

// ── The prediction ─────────────────────────────────────────────────────────

export interface PoolTally { optionKey: string; total: number; bettorCount: number }

/** The prediction's numbers from the market and its pools. */
export function predictionView(m: {
  id: string; attempt: number; status: SpeedrunPredictionView["status"]; lockAfter: number; lockName: string | null;
  resolvedValue: string | null; endedAt: number | null; pools: PoolTally[];
}): SpeedrunPredictionView {
  const side = (k: "pb" | "no") => {
    const p = m.pools.find((x) => x.optionKey.toLowerCase() === k);
    return { total: p?.total ?? 0, people: p?.bettorCount ?? 0 };
  };
  const pb = side("pb");
  const no = side("no");
  const total = pb.total + no.total;
  let result: SpeedrunPredictionView["result"] = null;
  if (m.status === "settled" && (m.resolvedValue === "pb" || m.resolvedValue === "no")) {
    const winner = m.resolvedValue;
    const won = winner === "pb" ? pb : no;
    // Nobody on one side (or nobody at all): everyone got their tokens back.
    const refunded = pb.total === 0 || no.total === 0;
    result = { winner, winners: won.people, pot: total, refunded };
  }
  return {
    marketId: m.id, attempt: m.attempt, status: m.status, lockAfter: m.lockAfter, lockName: m.lockName,
    pbPct: total > 0 ? Math.round((pb.total / total) * 100) : null, total, people: pb.people + no.people, pb, no, result,
    endedAt: m.endedAt,
  };
}

/** Did most of the tokens go on the side that won? */
export const chatCalledIt = (v: SpeedrunPredictionView): boolean =>
  !!v.result && v.total > 0 && (v.result.winner === "pb" ? v.pb.total > v.no.total : v.no.total > v.pb.total);

/** 🔮 Prediction open, with how to bet in chat and on the live page. */
export function predictionOpenLine(name: string, livePath: string | null): string {
  return `🔮 Prediction: will ${name} PB this run? Type !bet pb 100 or !bet no 100${livePath ? ` · or pick on ${livePath}` : ""}`;
}

export function predictionLockLine(v: SpeedrunPredictionView): string {
  if (v.total === 0) return "🔒 Bets are locked. Nobody put tokens in this time. It settles when the run ends.";
  return `🔒 Bets are locked: ${v.pbPct ?? 0}% say PB, ${tokens(v.total)} tokens in. It settles when the run ends.`;
}

/** The finish or a reset after the lock. `finalMs` and `oldPbMs` for a finish; `resetAt` (a split name) for a reset. */
export function predictionSettleLine(v: SpeedrunPredictionView, o: { finalMs?: number | null; oldPbMs?: number | null; resetAt?: string | null }): string {
  const r = v.result;
  const share = !r || v.total === 0
    ? ""
    : r.refunded
      ? " Everyone picked the same side, so everyone has their tokens back."
      : ` ${people(r.winners)} who said ${r.winner === "pb" ? "PB" : "no"} split ${tokens(r.pot)} tokens.`;
  if (r?.winner === "pb") {
    const faster = o.finalMs != null && o.oldPbMs != null && o.oldPbMs > o.finalMs ? `, ${fmtDelta(o.oldPbMs - o.finalMs)} faster` : "";
    return `🎉 New PB!${o.finalMs != null ? ` ${fmtClock(o.finalMs)}${faster}.` : ""}${share}`;
  }
  if (o.resetAt !== undefined) return `🔁 Run reset${o.resetAt ? ` at ${o.resetAt}` : ""}. No PB this time.${share}`;
  return `🏁 Finished${o.finalMs != null ? ` in ${fmtClock(o.finalMs)}` : ""}, no PB this time.${share}`;
}

export const PREDICTION_REFUND_LINE = "↩️ Reset before the bets locked. Everyone has their tokens back.";

/** What the overlay's prediction line says: the tally while bets are open or locked, then how it ended. */
export function predictionWords(p: SpeedrunPredictionView, opts: { short?: boolean } = {}): { kind: "tally" | "won" | "settled"; title: string; status?: string; line: string; pct: number | null } {
  if (p.status === "cancelled") return { kind: "settled", title: "Bets returned", line: opts.short ? "Reset before the lock" : "Reset before the lock: everyone got their tokens back", pct: null };
  if (p.status === "settled" && p.result) {
    const r = p.result;
    const share = p.total === 0 ? "Nobody put tokens in" : r.refunded ? "Everyone got their tokens back" : `${tokens(r.winners)} ${r.winners === 1 ? "person" : "people"}${chatCalledIt(p) ? "" : ` who said ${r.winner === "pb" ? "PB" : "no"}`} split ${tokens(r.pot)} tokens`;
    if (chatCalledIt(p)) return { kind: "won", title: "Chat called it", line: share, pct: null };
    return { kind: "settled", title: r.winner === "pb" ? "PB this run" : "No PB this run", line: share, pct: null };
  }
  const locked = p.status === "locked";
  const where = p.lockName ? ` after ${p.lockName}` : "";
  if (p.total === 0) {
    return locked
      ? { kind: "tally", title: "Bets are locked", line: "Nobody put tokens in", pct: null }
      : { kind: "tally", title: "Will it be a PB?", status: "Open", line: opts.short ? `!bet pb or !bet no · locks${where}` : `!bet pb 100 or !bet no 100 · locks${where}`, pct: null };
  }
  return {
    kind: "tally",
    title: `Chat: ${p.pbPct ?? 0}% say PB`,
    status: locked ? "Locked" : "Open",
    line: opts.short ? `${tokens(p.total)} tokens · ${locked ? "locked" : "open"}` : `${tokens(p.total)} tokens in · ${locked ? "settles at the finish" : `locks${where}`}`,
    pct: p.pbPct,
  };
}


/** What a stake would come back as if `side` won now (everyone who picks right shares every token put in). */
export function payoutIfWon(stake: number, side: "pb" | "no", pb: number, no: number): number {
  const mine = (side === "pb" ? pb : no) + stake;
  const other = side === "pb" ? no : pb;
  if (other <= 0) return stake; // nobody on the other side: everyone gets their own back
  return Math.floor(((mine + other) * stake) / mine);
}
