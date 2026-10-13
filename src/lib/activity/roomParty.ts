/**
 * The party games in the Discord Activity's room (server only): Most Likely
 * To, Odd One Out and Tier Wars, played by the call on the same rules as a live
 * night (src/lib/originals/*) and shown with the live night's own phone panels.
 *
 * Seats: the panels and rules number players, so a game gives everyone in the
 * room a seat (their place in `seats`); anyone who joins later gets the next
 * one and plays from the next round. Like live nights, it's host-driven: whoever
 * runs the room deals a round, everyone answers on their own screen, and the
 * host reveals once everyone's in.
 *
 * Votes and ballots go in the room's answers table under the round's room
 * round number (so racing taps never clash), and are copied into the round
 * when it's revealed, after which they can't change: scores come from the
 * revealed rounds alone. Every round, including Odd One Out's secret word and
 * who's faking it, lives in the room's `secret`; views only ever carry what this
 * player may see (their own card, their own vote).
 */

import "server-only";
import { WORD_PACKS } from "@/data/originals/odd-one-out";
import { PROMPT_PACKS } from "@/data/originals/most-likely";
import { TIER_TOPICS } from "@/data/originals/tier-wars";
import * as odd from "@/lib/originals/oddOneOut";
import * as likely from "@/lib/originals/mostLikely";
import * as tiers from "@/lib/originals/tierWars";
import * as bingo from "@/lib/originals/bingo";

export type PartySlug = "most-likely-to" | "odd-one-out" | "tier-wars" | "number-bingo";
export const PARTY_SLUGS: PartySlug[] = ["most-likely-to", "odd-one-out", "tier-wars", "number-bingo"];
export const PARTY_NAMES: Record<PartySlug, string> = { "most-likely-to": "Most Likely To", "odd-one-out": "Odd One Out", "tier-wars": "Tier Wars", "number-bingo": "Bingo" };
/** How many rounds the panels call a full game (the host can finish any time). */
const LENGTH: Record<PartySlug, number> = { "most-likely-to": 8, "odd-one-out": 5, "tier-wars": 4, "number-bingo": 3 };
/** Players a game needs before a round can be dealt. */
const MIN_PLAYERS: Record<PartySlug, number> = { "most-likely-to": 3, "odd-one-out": 3, "tier-wars": 3, "number-bingo": 2 };
/** Bingo calls a number this often unless whoever runs the room changes it (0 = they call each one). */
export const BINGO_CALL_SECONDS = [0, 6, 10, 15] as const;
export const BINGO_DEFAULT_SECONDS = 10;

interface BingoState { phase: "calling" | "done"; called: number[]; winner: number | null; line: number[] | null; pattern: bingo.Pattern; lastCallAt: number }
const MAX_ROUNDS = 30;

interface Vote { voter: number; target: number }
interface Ballot { voter: number; ranks: tiers.Ballot }
export type PartyRound =
  | { slug: "odd-one-out"; round: number; roundNo: number; players: number[]; state: odd.OddRound; votes: Vote[] | null }
  | { slug: "most-likely-to"; round: number; roundNo: number; players: number[]; state: likely.LikelyRound; votes: Vote[] | null }
  | { slug: "tier-wars"; round: number; roundNo: number; players: number[]; state: tiers.TierRound; ballots: Ballot[] | null }
  | { slug: "number-bingo"; round: number; roundNo: number; players: number[]; state: BingoState; cards: Record<number, number[]> };

/** The room's public side of a party game. */
export interface PartyState { kind: "party"; slug: PartySlug; seats: string[]; seen: string[]; /** Bingo: seconds between calls (0 = called by hand). */ callSeconds?: number }
/** The room's secret side: every round, answers included. */
export interface PartySecret { rounds: PartyRound[] }

export class PartyRuleError extends Error {
  constructor(public code: string) { super(code); }
}

/** Seats for everyone here, keeping the seats people already have. */
export function seatEveryone(seats: string[], active: string[]): string[] {
  return [...seats, ...active.filter((id) => !seats.includes(id))];
}

/** What a round's answers look like as votes/ballots, from the answers table. */
export function readAnswers(r: PartyRound, rows: { identity_id: string; slot: string; answer: string }[], seats: string[]): Vote[] | Ballot[] {
  const seatOf = (id: string) => seats.indexOf(id);
  const out: (Vote | Ballot)[] = [];
  if (r.slug === "number-bingo") return [];
  for (const row of rows) {
    const voter = seatOf(row.identity_id);
    if (voter < 0 || !r.players.includes(voter)) continue;
    if (r.slug === "tier-wars") {
      if (row.slot !== "") continue;
      try {
        const ranks = tiers.cleanBallot(r.state, JSON.parse(row.answer));
        if (ranks) out.push({ voter, ranks });
      } catch { /* not a ballot */ }
    } else {
      if (row.slot !== (r.slug === "odd-one-out" ? "vote" : "")) continue;
      const target = Number(row.answer);
      if (Number.isInteger(target) && r.players.includes(target)) out.push({ voter, target });
    }
  }
  return out as Vote[] | Ballot[];
}

/** Points per seat for one round (zero until it's done). */
function roundPoints(r: PartyRound): Map<number, number> {
  if (r.slug === "number-bingo") return r.state.phase === "done" && r.state.winner !== null ? new Map([[r.state.winner, 1]]) : new Map();
  if (r.slug === "tier-wars") return r.state.phase === "done" && r.ballots ? tiers.scoreRound(r.state, r.ballots) : new Map();
  if (r.slug === "most-likely-to") return r.state.phase === "done" && r.votes ? likely.scoreRound(r.votes) : new Map();
  return r.state.phase === "done" && r.votes ? odd.scoreRound(r.state, r.votes) : new Map();
}

/** Points per player (identity id) across the game's finished rounds. */
export function partyScores(st: PartyState, sec: PartySecret): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of sec.rounds) for (const [seat, pts] of roundPoints(r)) {
    const id = st.seats[seat];
    if (id) out[id] = (out[id] ?? 0) + pts;
  }
  return out;
}

export type PartyAct = { action: string; pack?: unknown; topic?: unknown; target?: unknown; ranks?: unknown; guess?: unknown; ok?: unknown; pattern?: unknown; seconds?: unknown };

/** What a party action changes. `answer` = write this player's answer; `secret` = the new rounds; `finish` = end the game. */
export type PartyChange =
  | { kind: "answer"; slot: string; answer: string }
  | { kind: "rounds"; rounds: PartyRound[]; seats?: string[]; seen?: string[]; nextRoundNo?: boolean }
  | { kind: "settings"; callSeconds: number }
  | { kind: "finish" };

/**
 * Works out what an action does (pure, apart from the dealing's randomness).
 * `answers` = this round's answer rows when a reveal needs them.
 */
export function partyAction(
  st: PartyState, sec: PartySecret, a: PartyAct,
  ctx: { me: string; isHost: boolean; active: string[]; roundNo: number; answers: { identity_id: string; slot: string; answer: string }[] },
): PartyChange {
  const rounds = sec.rounds;
  const last = rounds[rounds.length - 1] ?? null;
  const prefix = st.slug === "odd-one-out" ? "oo_" : st.slug === "most-likely-to" ? "ml_" : st.slug === "number-bingo" ? "bg_" : "tw_";
  if (!a.action.startsWith(prefix)) throw new PartyRuleError("bad_request");
  const verb = a.action.slice(3);
  const hostOnly = () => { if (!ctx.isHost) throw new PartyRuleError("not_host"); };
  const mySeat = st.seats.indexOf(ctx.me);
  const replaceLast = (r: PartyRound): PartyChange => ({ kind: "rounds", rounds: [...rounds.slice(0, -1), r] });

  if (verb === "round") {
    hostOnly();
    if (last && last.state.phase !== "done") throw new PartyRuleError("round_open");
    if (rounds.length >= MAX_ROUNDS) throw new PartyRuleError("bad_request");
    const seats = seatEveryone(st.seats, ctx.active);
    const players = ctx.active.map((id) => seats.indexOf(id)).filter((i) => i >= 0).sort((x, y) => x - y);
    if (players.length < MIN_PLAYERS[st.slug]) throw new PartyRuleError(MIN_PLAYERS[st.slug] === 2 ? "need_two" : "need_three");
    const round = (last?.round ?? 0) + 1;
    // The round's answers go under the room's next round number.
    const roundNo = ctx.roundNo + 1;
    let r: PartyRound;
    let key: string;
    if (st.slug === "number-bingo") {
      // A named pattern, or "series" to step line → corners → X → frame → blackout round by round.
      const asked = String(a.pattern ?? "line");
      const pattern: bingo.Pattern = asked === "series" ? bingo.seriesPattern(round) : (bingo.PATTERNS.some((p) => p.id === asked) ? asked as bingo.Pattern : "line");
      const cards = Object.fromEntries(players.map((seat) => [seat, bingo.makeCard()]));
      r = { slug: "number-bingo", round, roundNo, players, state: { phase: "calling", called: [], winner: null, line: null, pattern, lastCallAt: Date.now() }, cards };
      key = `bingo:${roundNo}`;
    } else if (st.slug === "odd-one-out") {
      const state = odd.dealRound(players, String(a.pack ?? ""), st.seen);
      r = { slug: "odd-one-out", round, roundNo, players, state, votes: null }; key = state.word;
    } else if (st.slug === "most-likely-to") {
      const state = likely.dealPrompt(String(a.pack ?? ""), st.seen);
      r = { slug: "most-likely-to", round, roundNo, players, state, votes: null }; key = state.prompt;
    } else {
      const state = tiers.dealTopic(String(a.topic ?? ""), st.seen);
      r = { slug: "tier-wars", round, roundNo, players, state, ballots: null }; key = state.topic;
    }
    return { kind: "rounds", rounds: [...rounds, r].slice(-MAX_ROUNDS), seats, seen: st.slug === "number-bingo" ? st.seen : [...st.seen, key].slice(-400), nextRoundNo: true };
  }

  if (last?.slug === "number-bingo") {
    if (verb === "call") {
      hostOnly();
      if (last.state.phase !== "calling") throw new PartyRuleError("closed");
      const n = bingo.nextCall(last.state.called);
      if (n === null) throw new PartyRuleError("closed");
      return replaceLast({ ...last, state: { ...last.state, called: [...last.state.called, n], lastCallAt: Date.now() } });
    }
    if (verb === "claim") {
      if (mySeat < 0 || !last.players.includes(mySeat)) throw new PartyRuleError("not_playing");
      if (last.state.phase !== "calling") throw new PartyRuleError("closed");
      const card = last.cards[mySeat];
      const line = card ? bingo.patternHit(card, last.state.called, last.state.pattern) : null;
      if (!line) throw new PartyRuleError("no_bingo");
      return replaceLast({ ...last, state: { ...last.state, phase: "done", winner: mySeat, line } });
    }
  }
  if (st.slug === "number-bingo" && verb === "auto") {
    hostOnly();
    const seconds = Number(a.seconds);
    if (!(BINGO_CALL_SECONDS as readonly number[]).includes(seconds)) throw new PartyRuleError("bad_request");
    return { kind: "settings", callSeconds: seconds };
  }

  if (verb === "vote") {
    if (!last || mySeat < 0 || !last.players.includes(mySeat)) throw new PartyRuleError("not_playing");
    if (last.slug === "tier-wars") {
      if (last.state.phase !== "ranking") throw new PartyRuleError("closed");
      const ranks = tiers.cleanBallot(last.state, a.ranks);
      if (!ranks) throw new PartyRuleError("rank_everything");
      return { kind: "answer", slot: "", answer: JSON.stringify(ranks) };
    }
    const open = last.slug === "odd-one-out" ? last.state.phase === "hints" : last.state.phase === "voting";
    if (!open) throw new PartyRuleError("closed");
    const target = Number(a.target);
    if (!last.players.includes(target)) throw new PartyRuleError("bad_request");
    // Most Likely To lets you vote for yourself; Odd One Out doesn't.
    if (last.slug === "odd-one-out" && target === mySeat) throw new PartyRuleError("bad_request");
    return { kind: "answer", slot: last.slug === "odd-one-out" ? "vote" : "", answer: String(target) };
  }

  if (verb === "reveal") {
    hostOnly();
    if (!last || last.slug === "number-bingo") throw new PartyRuleError("closed");
    const got = readAnswers(last, ctx.answers, st.seats);
    if (!got.length) throw new PartyRuleError("no_votes");
    if (last.slug === "tier-wars") {
      if (last.state.phase !== "ranking") throw new PartyRuleError("closed");
      return replaceLast({ ...last, ballots: got as Ballot[], state: { ...last.state, phase: "done" } });
    }
    if (last.slug === "most-likely-to") {
      if (last.state.phase !== "voting") throw new PartyRuleError("closed");
      return replaceLast({ ...last, votes: got as Vote[], state: { ...last.state, phase: "done" } });
    }
    if (last.state.phase !== "hints") throw new PartyRuleError("closed");
    const votes = got as Vote[];
    const caught = odd.isCaught(last.state, votes);
    return replaceLast({ ...last, votes, state: { ...last.state, phase: caught ? "guess" : "done" } });
  }

  if (last?.slug === "odd-one-out" && verb === "guess") {
    if (last.state.phase !== "guess") throw new PartyRuleError("closed");
    if (mySeat !== last.state.odd) throw new PartyRuleError("not_playing");
    const guess = String(a.guess ?? "").trim().slice(0, 40);
    if (!guess) throw new PartyRuleError("bad_request");
    return replaceLast({ ...last, state: { ...last.state, guess, guessOk: odd.guessMatches(guess, last.state.word), phase: "done" } });
  }

  if (last?.slug === "odd-one-out" && verb === "judge") {
    // The host settles it: a guess said out loud in the call, or a close typed one.
    hostOnly();
    if (!last.votes || !odd.isCaught(last.state, last.votes) || last.state.phase === "hints") throw new PartyRuleError("closed");
    return replaceLast({ ...last, state: { ...last.state, guessOk: !!a.ok, phase: "done" } });
  }

  if (verb === "finish") {
    hostOnly();
    if (last && last.state.phase !== "done") throw new PartyRuleError("round_open");
    if (!rounds.length) throw new PartyRuleError("bad_request");
    return { kind: "finish" };
  }
  throw new PartyRuleError("bad_request");
}

/** Bingo's timer: the next number, when one is due. Null when nothing changes. */
export function partyTick(st: PartyState, sec: PartySecret, now: number): PartyRound[] | null {
  const last = sec.rounds[sec.rounds.length - 1];
  if (st.slug !== "number-bingo" || last?.slug !== "number-bingo" || last.state.phase !== "calling") return null;
  const every = st.callSeconds ?? BINGO_DEFAULT_SECONDS;
  if (!every || now - last.state.lastCallAt < every * 1000) return null;
  const n = bingo.nextCall(last.state.called);
  if (n === null) return null;
  return [...sec.rounds.slice(0, -1), { ...last, state: { ...last.state, called: [...last.state.called, n], lastCallAt: now } }];
}

// ── What a player sees (the live night panels' shapes) ──────────────────────

const counts = (votes: Vote[]) => odd.tally(votes);

/**
 * The game as this player sees it, in the shape its live-night panel takes.
 * `answers` = the open round's answer rows (for who's voted and this player's own vote).
 */
export function partyView(st: PartyState, sec: PartySecret, me: string, active: string[], answers: { identity_id: string; slot: string; answer: string }[], art: (src?: string) => string | undefined) {
  const rounds = sec.rounds;
  const last = rounds[rounds.length - 1] ?? null;
  const mySeat = st.seats.indexOf(me) >= 0 ? st.seats.indexOf(me) : null;
  const here = active.map((id) => st.seats.indexOf(id)).filter((i) => i >= 0);
  const players = last && last.state.phase !== "done" ? last.players : [...new Set([...here])].sort((x, y) => x - y);
  const totals = new Map<number, number>();
  for (const r of rounds) for (const [seat, pts] of roundPoints(r)) totals.set(seat, (totals.get(seat) ?? 0) + pts);
  const totalsList = players.map((seat) => ({ seat, points: totals.get(seat) ?? 0 }));
  const inRound = last && mySeat !== null && last.players.includes(mySeat) ? mySeat : null;
  // The open round's answers so far (a revealed round uses the ones it froze).
  const live = last ? readAnswers(last, answers, st.seats) : [];

  if (st.slug === "number-bingo") {
    const r = last?.slug === "number-bingo" ? last : null;
    return {
      slug: "number-bingo" as const, label: PARTY_NAMES[st.slug], ready: true, players, totalRounds: LENGTH[st.slug],
      patterns: bingo.PATTERNS.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb })),
      callSeconds: st.callSeconds ?? BINGO_DEFAULT_SECONDS,
      current: r ? {
        round: r.round,
        // Marks on this screen are kept per room round, so a new game never shows old marks.
        scope: String(r.roundNo),
        phase: r.state.phase, called: r.state.called, last: r.state.called[r.state.called.length - 1] ?? null,
        winner: r.state.winner, line: r.state.line, pattern: r.state.pattern,
        patternLabel: bingo.PATTERNS.find((p) => p.id === r.state.pattern)?.label ?? "Any line",
        // Only this player's own card.
        myCard: inRound === null ? null : r.cards[inRound] ?? null,
      } : null,
      totals: totalsList,
      history: rounds.filter((x) => x.slug === "number-bingo" && x.state.phase === "done").map((x) => ({ round: x.round, winner: (x.state as BingoState).winner })),
    };
  }

  if (st.slug === "most-likely-to") {
    const r = last?.slug === "most-likely-to" ? last : null;
    const votes = (r?.votes ?? live) as Vote[];
    const c = counts(votes);
    return {
      slug: "most-likely-to" as const, label: PARTY_NAMES[st.slug], ready: true, players, totalRounds: LENGTH[st.slug],
      packs: PROMPT_PACKS.map((p) => ({ id: p.id, label: p.label })),
      current: r ? {
        round: r.round, prompt: r.state.prompt, phase: r.state.phase,
        votesIn: votes.length, voters: r.players.length, voted: votes.map((v) => v.voter),
        myVote: inRound === null ? null : votes.find((v) => v.voter === inRound)?.target ?? null,
        // Votes stay anonymous: only the counts are ever shown.
        reveal: r.state.phase === "done" && r.votes ? {
          votes: r.players.map((seat) => ({ seat, count: c.get(seat) ?? 0 })),
          top: likely.topPicks(r.votes),
          points: [...likely.scoreRound(r.votes)].map(([seat, points]) => ({ seat, points })),
        } : null,
      } : null,
      totals: totalsList,
      history: rounds.filter((x) => x.slug === "most-likely-to" && x.state.phase === "done").map((x) => ({ round: x.round, prompt: (x.state as likely.LikelyRound).prompt, top: likely.topPicks((x as { votes: Vote[] }).votes ?? []) })),
    };
  }

  if (st.slug === "tier-wars") {
    const r = last?.slug === "tier-wars" ? last : null;
    const ballots = (r?.ballots ?? live) as Ballot[];
    return {
      slug: "tier-wars" as const, label: PARTY_NAMES[st.slug], ready: true, players, totalRounds: LENGTH[st.slug],
      tiers: [...tiers.TIERS],
      topics: TIER_TOPICS.map((t) => ({ id: t.id, label: t.label })),
      current: r ? {
        round: r.round, title: r.state.title, items: r.state.items.map((it) => ({ ...it, ...(it.image ? { image: art(it.image) } : {}) })), phase: r.state.phase,
        votesIn: ballots.length, voters: r.players.length, voted: ballots.map((b) => b.voter),
        // Your own ranking comes back so you can change it until the reveal. Nobody else's does.
        mine: inRound === null ? null : ballots.find((b) => b.voter === inRound)?.ranks ?? null,
        reveal: r.state.phase === "done" && r.ballots ? {
          room: tiers.roomTiers(r.state, r.ballots),
          points: [...tiers.scoreRound(r.state, r.ballots)].map(([seat, points]) => ({ seat, points })),
          hottest: tiers.hottestTake(r.state, r.ballots),
        } : null,
      } : null,
      totals: totalsList,
      history: rounds.filter((x) => x.slug === "tier-wars" && x.state.phase === "done").map((x) => ({ round: x.round, title: (x.state as tiers.TierRound).title })),
    };
  }

  const r = last?.slug === "odd-one-out" ? last : null;
  const votes = (r?.votes ?? live) as Vote[];
  const c = counts(votes);
  const revealed = !!r && r.state.phase !== "hints";
  const done = r?.state.phase === "done";
  return {
    slug: "odd-one-out" as const, label: PARTY_NAMES[st.slug], ready: true, players, totalRounds: LENGTH[st.slug],
    packs: WORD_PACKS.map((p) => ({ id: p.id, label: p.label })),
    current: r ? {
      round: r.round, category: r.state.category, start: r.state.start, phase: r.state.phase,
      votesIn: votes.length, voters: r.players.length, voted: votes.map((v) => v.voter),
      myVote: inRound === null ? null : votes.find((v) => v.voter === inRound)?.target ?? null,
      // Only this player's own card.
      hand: inRound === null ? null : odd.handFor(r.state, inRound),
      reveal: revealed && r.votes ? {
        odd: r.state.odd,
        caught: odd.isCaught(r.state, r.votes),
        votes: r.players.map((seat) => ({ seat, count: c.get(seat) ?? 0 })),
        // The word stays hidden while the odd one out is still guessing it.
        word: done ? r.state.word : null,
        guess: done ? r.state.guess ?? null : null,
        guessOk: done ? r.state.guessOk ?? null : null,
        points: done ? [...odd.scoreRound(r.state, r.votes)].map(([seat, points]) => ({ seat, points })) : [],
      } : null,
    } : null,
    totals: totalsList,
    history: rounds.filter((x) => x.slug === "odd-one-out" && x.state.phase === "done").map((x) => ({ round: x.round, word: (x.state as odd.OddRound).word, odd: (x.state as odd.OddRound).odd, caught: odd.isCaught(x.state as odd.OddRound, (x as { votes: Vote[] }).votes ?? []) })),
  };
}
