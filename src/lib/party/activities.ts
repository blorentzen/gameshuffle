import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isActivity, nightGame } from "@/lib/nights/games";
import { WORD_PACKS } from "@/data/originals/odd-one-out";
import { PROMPT_PACKS } from "@/data/originals/most-likely";
import * as likely from "@/lib/originals/mostLikely";
import * as tiers from "@/lib/originals/tierWars";
import { TIER_TOPICS } from "@/data/originals/tier-wars";
import * as draft from "@/lib/originals/draft";
import * as bingo from "@/lib/originals/bingo";
import {
  dealRound, finishingOrder, guessMatches, handFor, isCaught, scoreRound, tally,
  type OddHand, type OddRound, type OddVote,
} from "@/lib/originals/oddOneOut";
import { PartyError, isMissing, recordResults, type Loaded, type Viewer } from "@/lib/party/nights";

/**
 * Activities: GameShuffle Originals played on the phones and the TV inside a
 * live night (party-deals-m1). The Secret Deal engine: each round deals every
 * seat a private payload, plus one table row (seat null) holding the answer.
 * Nothing here trusts the host with other people's secrets: during a round the
 * host is just a player, and sees only their own seat.
 */

export interface DealRow { id: string; game_id: string; round: number; seat_index: number | null; payload: Record<string, unknown>; revealed_at: string | null }
export interface DealVoteRow { id: string; game_id: string; round: number; topic: string; voter_seat: number; choice: Record<string, unknown> }

export interface ActivityData { ready: boolean; deals: DealRow[]; votes: DealVoteRow[] }

/** Deals and votes for the night. Degrades to "not ready" before the migration is applied. */
export async function loadActivity(nightId: string): Promise<ActivityData> {
  const svc = createServiceClient();
  const [d, v] = await Promise.all([
    svc.from("party_deals").select("id, game_id, round, seat_index, payload, revealed_at").eq("night_id", nightId).order("round"),
    svc.from("party_votes").select("id, game_id, round, topic, voter_seat, choice").eq("night_id", nightId),
  ]);
  if (isMissing(d.error) || isMissing(v.error)) return { ready: false, deals: [], votes: [] };
  if (d.error || v.error) throw new PartyError("server_error", 500);
  return { ready: true, deals: (d.data ?? []) as DealRow[], votes: (v.data ?? []) as DealVoteRow[] };
}

/** Seats that play an activity: people who are actually in the night (not CPUs, not empty seats). */
export function activityPlayers(l: Loaded): number[] {
  return l.seats.filter((s) => !s.is_cpu && (s.user_id || s.guest_key_hash || s.identity_id)).map((s) => s.seat_index);
}

const TOPIC = "odd";

function roundsOf(l: Loaded, a: ActivityData) {
  const gameId = l.current.id;
  const tables = a.deals.filter((d) => d.game_id === gameId && d.seat_index === null).sort((x, y) => x.round - y.round);
  return tables.map((t) => ({
    row: t,
    round: t.round,
    state: t.payload as unknown as OddRound,
    votes: a.votes.filter((v) => v.game_id === gameId && v.round === t.round && v.topic === TOPIC)
      .map((v): OddVote => ({ voter: v.voter_seat, target: Number(v.choice.target) })),
  }));
}

function totalsOf(rounds: ReturnType<typeof roundsOf>): Map<number, number> {
  const totals = new Map<number, number>();
  for (const r of rounds) {
    if (r.state.phase !== "done") continue;
    for (const [seat, pts] of scoreRound(r.state, r.votes)) totals.set(seat, (totals.get(seat) ?? 0) + pts);
  }
  return totals;
}

/** The activity as this viewer may see it, or null when the current game isn't an activity. */
export function activityView(l: Loaded, a: ActivityData, v: Viewer) {
  const slug = l.current.game_slug;
  if (!isActivity(slug)) return null;
  if (slug === "most-likely-to") return likelyView(l, a, v);
  if (slug === "tier-wars") return tierView(l, a, v);
  if (slug === "draft-night") return draftView(l, a, v);
  if (slug === "number-bingo") return bingoView(l, a, v);
  return oddView(l, a, v);
}

function oddView(l: Loaded, a: ActivityData, v: Viewer) {
  const slug = l.current.game_slug;
  const players = activityPlayers(l);
  const rounds = roundsOf(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const totals = totalsOf(rounds);
  const mySeat = v.seat !== null && players.includes(v.seat) ? v.seat : null;

  let current = null;
  if (last) {
    const s = last.state;
    const revealed = s.phase !== "hints";
    const done = s.phase === "done";
    const myDeal = mySeat === null ? null : a.deals.find((d) => d.game_id === l.current.id && d.round === last.round && d.seat_index === mySeat);
    const counts = tally(last.votes);
    current = {
      round: last.round,
      category: s.category,
      start: s.start,
      phase: s.phase,
      votesIn: last.votes.length,
      voters: players.length,
      voted: last.votes.map((x) => x.voter),
      myVote: mySeat === null ? null : last.votes.find((x) => x.voter === mySeat)?.target ?? null,
      hand: (myDeal?.payload ?? null) as OddHand | null,
      reveal: revealed ? {
        odd: s.odd,
        caught: isCaught(s, last.votes),
        votes: players.map((seat) => ({ seat, count: counts.get(seat) ?? 0 })),
        // The word stays hidden while the odd one out is still guessing it.
        word: done ? s.word : null,
        guess: done ? s.guess ?? null : null,
        guessOk: done ? s.guessOk ?? null : null,
        points: done ? [...scoreRound(s, last.votes)].map(([seat, pts]) => ({ seat, points: pts })) : [],
      } : null,
    };
  }
  return {
    slug: slug as "odd-one-out",
    label: nightGame(slug)?.label ?? slug,
    ready: a.ready,
    players,
    totalRounds: nightGame(slug)?.defaultLength ?? 5,
    packs: WORD_PACKS.map((p) => ({ id: p.id, label: p.label })),
    current,
    totals: players.map((seat) => ({ seat, points: totals.get(seat) ?? 0 })),
    history: rounds.filter((r) => r.state.phase === "done").map((r) => ({ round: r.round, word: r.state.word, odd: r.state.odd, caught: isCaught(r.state, r.votes) })),
  };
}

export type ActivityAction =
  | { action: "bg_round" }
  | { action: "bg_call" }
  | { action: "bg_claim" }
  | { action: "bg_finish" }
  | { action: "dn_start"; roster: string; picks: number }
  | { action: "dn_pick"; name: string }
  | { action: "dn_auto" }
  | { action: "tw_round"; topic: string }
  | { action: "tw_vote"; ranks: Record<string, number> }
  | { action: "tw_reveal" }
  | { action: "tw_finish" }
  | { action: "ml_round"; pack: string }
  | { action: "ml_vote"; target: number }
  | { action: "ml_reveal" }
  | { action: "ml_finish" }
  | { action: "oo_round"; pack: string }
  | { action: "oo_vote"; target: number }
  | { action: "oo_reveal" }
  | { action: "oo_guess"; guess: string }
  | { action: "oo_judge"; ok: boolean }
  | { action: "oo_finish" };

export async function runActivity(l: Loaded, v: Viewer, body: ActivityAction): Promise<Record<string, never>> {
  if (l.night.status !== "open") throw new PartyError("ended", 410);
  if (!isActivity(l.current.game_slug) || !l.current.id) throw new PartyError("not_an_activity", 409);
  if (l.current.status === "done") throw new PartyError("activity_done", 409);
  const a = await loadActivity(l.night.id);
  if (!a.ready) throw new PartyError("unavailable", 503);
  if (body.action.startsWith("bg_")) {
    if (l.current.game_slug !== "number-bingo") throw new PartyError("bad_action");
    return runBingo(l, v, body, a);
  }
  if (body.action.startsWith("dn_")) {
    if (l.current.game_slug !== "draft-night") throw new PartyError("bad_action");
    return runDraft(l, v, body, a);
  }
  if (body.action.startsWith("tw_")) {
    if (l.current.game_slug !== "tier-wars") throw new PartyError("bad_action");
    return runTier(l, v, body, a);
  }
  if (body.action.startsWith("ml_")) {
    if (l.current.game_slug !== "most-likely-to") throw new PartyError("bad_action");
    return runLikely(l, v, body, a);
  }
  if (l.current.game_slug !== "odd-one-out") throw new PartyError("bad_action");
  const svc = createServiceClient();
  const players = activityPlayers(l);
  const rounds = roundsOf(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };
  const setState = async (next: OddRound, reveal = false) => {
    if (!last) throw new PartyError("no_round", 409);
    const up = await svc.from("party_deals").update({ payload: next }).eq("id", last.row.id);
    if (up.error) throw new PartyError("server_error", 500);
    if (reveal) await svc.from("party_deals").update({ revealed_at: new Date().toISOString() }).eq("game_id", l.current.id).eq("round", last.round);
  };

  switch (body.action) {
    case "oo_round": {
      hostOnly();
      if (players.length < 3) throw new PartyError("need_three", 409);
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const round = (last?.round ?? 0) + 1;
      if (round > 30) throw new PartyError("too_many_rounds", 409);
      const used = rounds.map((r) => r.state.word);
      const state = dealRound(players, String(body.pack ?? ""), used);
      const rows = [
        { night_id: l.night.id, game_id: l.current.id, round, seat_index: null, payload: state },
        ...players.map((seat) => ({ night_id: l.night.id, game_id: l.current.id, round, seat_index: seat, payload: handFor(state, seat) })),
      ];
      const ins = await svc.from("party_deals").insert(rows);
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "oo_vote": {
      if (v.seat === null || !players.includes(v.seat)) throw new PartyError("not_playing", 403);
      if (!last || last.state.phase !== "hints") throw new PartyError("voting_closed", 409);
      const target = Number(body.target);
      if (!players.includes(target) || target === v.seat) throw new PartyError("bad_vote");
      const up = await svc.from("party_votes").upsert(
        { night_id: l.night.id, game_id: l.current.id, round: last.round, topic: TOPIC, voter_seat: v.seat, choice: { target } },
        { onConflict: "game_id,round,topic,voter_seat" },
      );
      if (up.error) throw new PartyError("server_error", 500);
      return {};
    }
    case "oo_reveal": {
      hostOnly();
      if (!last || last.state.phase !== "hints") throw new PartyError("stale", 409);
      if (!last.votes.length) throw new PartyError("no_votes", 409);
      const caught = isCaught(last.state, last.votes);
      await setState({ ...last.state, phase: caught ? "guess" : "done" }, !caught);
      return {};
    }
    case "oo_guess": {
      if (!last || last.state.phase !== "guess") throw new PartyError("stale", 409);
      if (v.seat !== last.state.odd) throw new PartyError("not_yours", 403);
      const guess = String(body.guess ?? "").trim().slice(0, 40);
      if (!guess) throw new PartyError("bad_guess");
      await setState({ ...last.state, guess, guessOk: guessMatches(guess, last.state.word), phase: "done" }, true);
      return {};
    }
    case "oo_judge": {
      // The host settles it: a guess said out loud, or a close typed one.
      hostOnly();
      if (!last || !isCaught(last.state, last.votes) || last.state.phase === "hints") throw new PartyError("stale", 409);
      await setState({ ...last.state, guessOk: !!body.ok, phase: "done" }, last.state.phase === "guess");
      return {};
    }
    case "oo_finish": {
      hostOnly();
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const totals = totalsOf(rounds);
      if (!rounds.length) throw new PartyError("no_rounds", 409);
      await recordResults(l, finishingOrder(players, totals), {}, "activity");
      return {};
    }
  }
  throw new PartyError("bad_action");
}

/* ── Most Likely To (vote and reveal, no secrets) ───────────────────────── */

const LIKELY = "likely";

function likelyRounds(l: Loaded, a: ActivityData) {
  const gameId = l.current.id;
  return a.deals.filter((d) => d.game_id === gameId && d.seat_index === null).sort((x, y) => x.round - y.round).map((t) => ({
    row: t,
    round: t.round,
    state: t.payload as unknown as likely.LikelyRound,
    votes: a.votes.filter((v) => v.game_id === gameId && v.round === t.round && v.topic === LIKELY)
      .map((v): likely.LikelyVote => ({ voter: v.voter_seat, target: Number(v.choice.target) })),
  }));
}

function likelyTotals(rounds: ReturnType<typeof likelyRounds>): Map<number, number> {
  const totals = new Map<number, number>();
  for (const r of rounds) {
    if (r.state.phase !== "done") continue;
    for (const [seat, pts] of likely.scoreRound(r.votes)) totals.set(seat, (totals.get(seat) ?? 0) + pts);
  }
  return totals;
}

function likelyView(l: Loaded, a: ActivityData, v: Viewer) {
  const slug = l.current.game_slug;
  const players = activityPlayers(l);
  const rounds = likelyRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const totals = likelyTotals(rounds);
  const mySeat = v.seat !== null && players.includes(v.seat) ? v.seat : null;
  let current = null;
  if (last) {
    const done = last.state.phase === "done";
    const counts = likely.tally(last.votes);
    current = {
      round: last.round,
      prompt: last.state.prompt,
      phase: last.state.phase,
      votesIn: last.votes.length,
      voters: players.length,
      voted: last.votes.map((x) => x.voter),
      myVote: mySeat === null ? null : last.votes.find((x) => x.voter === mySeat)?.target ?? null,
      // Votes stay anonymous: only the counts are ever shown.
      reveal: done ? {
        votes: players.map((seat) => ({ seat, count: counts.get(seat) ?? 0 })),
        top: likely.topPicks(last.votes),
        points: [...likely.scoreRound(last.votes)].map(([seat, pts]) => ({ seat, points: pts })),
      } : null,
    };
  }
  return {
    slug: slug as "most-likely-to",
    label: nightGame(slug)?.label ?? slug,
    ready: a.ready,
    players,
    totalRounds: nightGame(slug)?.defaultLength ?? 8,
    packs: PROMPT_PACKS.map((p) => ({ id: p.id, label: p.label })),
    current,
    totals: players.map((seat) => ({ seat, points: totals.get(seat) ?? 0 })),
    history: rounds.filter((r) => r.state.phase === "done").map((r) => ({ round: r.round, prompt: r.state.prompt, top: likely.topPicks(r.votes) })),
  };
}

async function runLikely(l: Loaded, v: Viewer, body: ActivityAction, a: ActivityData): Promise<Record<string, never>> {
  const svc = createServiceClient();
  const players = activityPlayers(l);
  const rounds = likelyRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };
  switch (body.action) {
    case "ml_round": {
      hostOnly();
      if (players.length < 3) throw new PartyError("need_three", 409);
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const round = (last?.round ?? 0) + 1;
      if (round > 30) throw new PartyError("too_many_rounds", 409);
      const state = likely.dealPrompt(String(body.pack ?? ""), rounds.map((r) => r.state.prompt));
      const ins = await svc.from("party_deals").insert({ night_id: l.night.id, game_id: l.current.id, round, seat_index: null, payload: state });
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "ml_vote": {
      if (v.seat === null || !players.includes(v.seat)) throw new PartyError("not_playing", 403);
      if (!last || last.state.phase !== "voting") throw new PartyError("voting_closed", 409);
      const target = Number(body.target);
      // Voting for yourself is allowed: sometimes you know.
      if (!players.includes(target)) throw new PartyError("bad_vote");
      const up = await svc.from("party_votes").upsert(
        { night_id: l.night.id, game_id: l.current.id, round: last.round, topic: LIKELY, voter_seat: v.seat, choice: { target } },
        { onConflict: "game_id,round,topic,voter_seat" },
      );
      if (up.error) throw new PartyError("server_error", 500);
      return {};
    }
    case "ml_reveal": {
      hostOnly();
      if (!last || last.state.phase !== "voting") throw new PartyError("stale", 409);
      if (!last.votes.length) throw new PartyError("no_votes", 409);
      const up = await svc.from("party_deals").update({ payload: { ...last.state, phase: "done" }, revealed_at: new Date().toISOString() }).eq("id", last.row.id);
      if (up.error) throw new PartyError("server_error", 500);
      return {};
    }
    case "ml_finish": {
      hostOnly();
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      if (!rounds.length) throw new PartyError("no_rounds", 409);
      await recordResults(l, finishingOrder(players, likelyTotals(rounds)), {}, "activity");
      return {};
    }
  }
  throw new PartyError("bad_action");
}

/* ── Tier Wars (vote and reveal: everyone ranks, the room decides) ─────────── */

const TIER = "tier";

function tierRounds(l: Loaded, a: ActivityData) {
  const gameId = l.current.id;
  return a.deals.filter((d) => d.game_id === gameId && d.seat_index === null).sort((x, y) => x.round - y.round).map((t) => ({
    row: t,
    round: t.round,
    state: t.payload as unknown as tiers.TierRound,
    ballots: a.votes.filter((v) => v.game_id === gameId && v.round === t.round && v.topic === TIER)
      .map((v): tiers.TierBallot => ({ voter: v.voter_seat, ranks: (v.choice.ranks ?? {}) as tiers.Ballot })),
  }));
}

function tierTotals(rounds: ReturnType<typeof tierRounds>): Map<number, number> {
  const totals = new Map<number, number>();
  for (const r of rounds) {
    if (r.state.phase !== "done") continue;
    for (const [seat, pts] of tiers.scoreRound(r.state, r.ballots)) totals.set(seat, (totals.get(seat) ?? 0) + pts);
  }
  return totals;
}

function tierView(l: Loaded, a: ActivityData, v: Viewer) {
  const slug = l.current.game_slug;
  const players = activityPlayers(l);
  const rounds = tierRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const totals = tierTotals(rounds);
  const mySeat = v.seat !== null && players.includes(v.seat) ? v.seat : null;
  let current = null;
  if (last) {
    const done = last.state.phase === "done";
    current = {
      round: last.round,
      title: last.state.title,
      items: last.state.items,
      phase: last.state.phase,
      votesIn: last.ballots.length,
      voters: players.length,
      voted: last.ballots.map((b) => b.voter),
      // Your own ranking comes back so you can adjust it until the reveal. Nobody else's does.
      mine: mySeat === null ? null : last.ballots.find((b) => b.voter === mySeat)?.ranks ?? null,
      reveal: done ? {
        room: tiers.roomTiers(last.state, last.ballots),
        points: [...tiers.scoreRound(last.state, last.ballots)].map(([seat, pts]) => ({ seat, points: pts })),
        hottest: tiers.hottestTake(last.state, last.ballots),
      } : null,
    };
  }
  return {
    slug: slug as "tier-wars",
    label: nightGame(slug)?.label ?? slug,
    ready: a.ready,
    players,
    totalRounds: nightGame(slug)?.defaultLength ?? 4,
    tiers: [...tiers.TIERS],
    topics: TIER_TOPICS.map((t) => ({ id: t.id, label: t.label })),
    current,
    totals: players.map((seat) => ({ seat, points: totals.get(seat) ?? 0 })),
    history: rounds.filter((r) => r.state.phase === "done").map((r) => ({ round: r.round, title: r.state.title })),
  };
}

async function runTier(l: Loaded, v: Viewer, body: ActivityAction, a: ActivityData): Promise<Record<string, never>> {
  const svc = createServiceClient();
  const players = activityPlayers(l);
  const rounds = tierRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };
  switch (body.action) {
    case "tw_round": {
      hostOnly();
      if (players.length < 3) throw new PartyError("need_three", 409);
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const round = (last?.round ?? 0) + 1;
      if (round > 30) throw new PartyError("too_many_rounds", 409);
      const state = tiers.dealTopic(String(body.topic ?? ""), rounds.map((r) => r.state.topic));
      const ins = await svc.from("party_deals").insert({ night_id: l.night.id, game_id: l.current.id, round, seat_index: null, payload: state });
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "tw_vote": {
      if (v.seat === null || !players.includes(v.seat)) throw new PartyError("not_playing", 403);
      if (!last || last.state.phase !== "ranking") throw new PartyError("voting_closed", 409);
      const ranks = tiers.cleanBallot(last.state, body.ranks);
      if (!ranks) throw new PartyError("rank_everything");
      const up = await svc.from("party_votes").upsert(
        { night_id: l.night.id, game_id: l.current.id, round: last.round, topic: TIER, voter_seat: v.seat, choice: { ranks } },
        { onConflict: "game_id,round,topic,voter_seat" },
      );
      if (up.error) throw new PartyError("server_error", 500);
      return {};
    }
    case "tw_reveal": {
      hostOnly();
      if (!last || last.state.phase !== "ranking") throw new PartyError("stale", 409);
      if (!last.ballots.length) throw new PartyError("no_votes", 409);
      const up = await svc.from("party_deals").update({ payload: { ...last.state, phase: "done" }, revealed_at: new Date().toISOString() }).eq("id", last.row.id);
      if (up.error) throw new PartyError("server_error", 500);
      return {};
    }
    case "tw_finish": {
      hostOnly();
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      if (!rounds.length) throw new PartyError("no_rounds", 409);
      await recordResults(l, finishingOrder(players, tierTotals(rounds)), {}, "activity");
      return {};
    }
  }
  throw new PartyError("bad_action");
}

/* ── Draft Night (snake draft; pools last the rest of the night) ────────────── */

function draftRow(l: Loaded, a: ActivityData, gameId = l.current.id) {
  const row = a.deals.find((d) => d.game_id === gameId && d.seat_index === null && d.round === 1);
  return row ? { row, state: row.payload as unknown as draft.DraftState } : null;
}

/** Everyone's drafted pool from tonight's latest finished draft, for every game after it. */
export function draftPools(l: Loaded, a: ActivityData): { roster: string; pools: { seat: number; names: string[] }[] } | null {
  const drafts = l.games.filter((g) => g.game_slug === "draft-night" && g.status === "done")
    .map((g) => draftRow(l, a, g.id)).filter((d): d is NonNullable<ReturnType<typeof draftRow>> => !!d && d.state.phase === "done");
  const last = drafts[drafts.length - 1];
  if (!last) return null;
  const p = draft.pools(last.state);
  return { roster: last.state.roster, pools: Object.entries(p).map(([seat, names]) => ({ seat: Number(seat), names })) };
}

function draftView(l: Loaded, a: ActivityData, v: Viewer) {
  const slug = l.current.game_slug;
  const players = activityPlayers(l);
  const d = draftRow(l, a);
  const roster = d ? draft.draftRoster(d.state.roster) : null;
  return {
    slug: slug as "draft-night",
    label: nightGame(slug)?.label ?? slug,
    ready: a.ready,
    players,
    rosters: draft.draftRosters().map((r) => ({ slug: r.slug, label: r.label, size: r.items.length })),
    pickSeconds: draft.PICK_SECONDS,
    me: v.seat,
    current: d ? {
      roster: d.state.roster,
      rosterLabel: roster?.label ?? d.state.roster,
      items: roster?.items ?? [],
      picks: d.state.picks,
      order: d.state.order,
      taken: d.state.taken,
      onTheClock: draft.onTheClock(d.state),
      turnStartedAt: d.state.turnStartedAt,
      phase: d.state.phase,
      pools: Object.entries(draft.pools(d.state)).map(([seat, names]) => ({ seat: Number(seat), names })),
    } : null,
  };
}

async function runDraft(l: Loaded, v: Viewer, body: ActivityAction, a: ActivityData): Promise<Record<string, never>> {
  const svc = createServiceClient();
  const players = activityPlayers(l);
  const d = draftRow(l, a);
  const save = async (next: draft.DraftState) => {
    const up = await svc.from("party_deals").update({ payload: next }).eq("id", d!.row.id);
    if (up.error) throw new PartyError("server_error", 500);
    // The last pick ends the draft, which finishes this game so the night moves on.
    if (next.phase === "done") {
      await svc.from("party_deals").update({ revealed_at: new Date().toISOString() }).eq("id", d!.row.id);
      const done = await svc.from("party_games").update({ status: "done", ended_at: new Date().toISOString() }).eq("id", l.current.id);
      if (done.error) throw new PartyError("server_error", 500);
    }
  };
  switch (body.action) {
    case "dn_start": {
      if (!v.isHost) throw new PartyError("host_only", 403);
      if (players.length < 2) throw new PartyError("need_two", 409);
      if (d) throw new PartyError("round_open", 409);
      if (!draft.draftRoster(String(body.roster ?? ""))) throw new PartyError("bad_roster");
      const state = draft.startDraft(players, String(body.roster), Number(body.picks ?? draft.DEFAULT_PICKS), new Date().toISOString());
      const size = draft.draftRoster(state.roster)!.items.length;
      if (players.length * state.picks > size) throw new PartyError("roster_too_small", 409);
      const ins = await svc.from("party_deals").insert({ night_id: l.night.id, game_id: l.current.id, round: 1, seat_index: null, payload: state });
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "dn_pick": {
      if (!d || d.state.phase !== "drafting") throw new PartyError("stale", 409);
      if (v.seat === null) throw new PartyError("not_playing", 403);
      const next = draft.makePick(d.state, v.seat, String(body.name ?? ""), new Date().toISOString());
      if (typeof next === "string") throw new PartyError(next, 409);
      await save(next);
      return {};
    }
    case "dn_auto": {
      // Anyone's phone can call this when the clock runs out; the host can call it any time.
      if (!d || d.state.phase !== "drafting") throw new PartyError("stale", 409);
      if (!v.isHost && !draft.clockExpired(d.state, Date.now())) throw new PartyError("clock_running", 409);
      const seat = draft.onTheClock(d.state);
      const name = draft.autoPickName(d.state);
      if (seat === null || !name) throw new PartyError("stale", 409);
      const next = draft.makePick(d.state, seat, name, new Date().toISOString());
      if (typeof next === "string") throw new PartyError("stale", 409);
      await save(next);
      return {};
    }
  }
  throw new PartyError("bad_action");
}

/* ── Number Bingo (couch version of Stream Bingo) ───────────────────────────── */

interface BingoRound { phase: "calling" | "done"; called: number[]; winner: number | null; line: number[] | null }

function bingoRounds(l: Loaded, a: ActivityData) {
  const gameId = l.current.id;
  return a.deals.filter((d) => d.game_id === gameId && d.seat_index === null).sort((x, y) => x.round - y.round)
    .map((t) => ({ row: t, round: t.round, state: t.payload as unknown as BingoRound }));
}

function bingoWins(rounds: ReturnType<typeof bingoRounds>): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rounds) if (r.state.phase === "done" && r.state.winner !== null) out.set(r.state.winner, (out.get(r.state.winner) ?? 0) + 1);
  return out;
}

function bingoView(l: Loaded, a: ActivityData, v: Viewer) {
  const slug = l.current.game_slug;
  const players = activityPlayers(l);
  const rounds = bingoRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const mySeat = v.seat !== null && players.includes(v.seat) ? v.seat : null;
  const myCard = last && mySeat !== null ? (a.deals.find((d) => d.game_id === l.current.id && d.round === last.round && d.seat_index === mySeat)?.payload.card as number[] | undefined) ?? null : null;
  const wins = bingoWins(rounds);
  return {
    slug: slug as "number-bingo",
    label: nightGame(slug)?.label ?? slug,
    ready: a.ready,
    players,
    totalRounds: nightGame(slug)?.defaultLength ?? 3,
    current: last ? {
      round: last.round,
      phase: last.state.phase,
      called: last.state.called,
      last: last.state.called[last.state.called.length - 1] ?? null,
      winner: last.state.winner,
      line: last.state.line,
      myCard,
    } : null,
    totals: players.map((seat) => ({ seat, points: wins.get(seat) ?? 0 })),
    history: rounds.filter((r) => r.state.phase === "done").map((r) => ({ round: r.round, winner: r.state.winner })),
  };
}

async function runBingo(l: Loaded, v: Viewer, body: ActivityAction, a: ActivityData): Promise<Record<string, never>> {
  const svc = createServiceClient();
  const players = activityPlayers(l);
  const rounds = bingoRounds(l, a);
  const last = rounds[rounds.length - 1] ?? null;
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };
  const save = async (next: BingoRound) => {
    const up = await svc.from("party_deals").update({ payload: next, ...(next.phase === "done" ? { revealed_at: new Date().toISOString() } : {}) }).eq("id", last!.row.id);
    if (up.error) throw new PartyError("server_error", 500);
  };
  switch (body.action) {
    case "bg_round": {
      hostOnly();
      if (players.length < 2) throw new PartyError("need_two", 409);
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const round = (last?.round ?? 0) + 1;
      if (round > 30) throw new PartyError("too_many_rounds", 409);
      const state: BingoRound = { phase: "calling", called: [], winner: null, line: null };
      const rows = [
        { night_id: l.night.id, game_id: l.current.id, round, seat_index: null, payload: state },
        ...players.map((seat) => ({ night_id: l.night.id, game_id: l.current.id, round, seat_index: seat, payload: { card: bingo.makeCard() } })),
      ];
      const ins = await svc.from("party_deals").insert(rows);
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "bg_call": {
      hostOnly();
      if (!last || last.state.phase !== "calling") throw new PartyError("stale", 409);
      const n = bingo.nextCall(last.state.called);
      if (n === null) throw new PartyError("all_called", 409);
      await save({ ...last.state, called: [...last.state.called, n] });
      return {};
    }
    case "bg_claim": {
      if (v.seat === null || !players.includes(v.seat)) throw new PartyError("not_playing", 403);
      if (!last || last.state.phase !== "calling") throw new PartyError("stale", 409);
      const card = a.deals.find((d) => d.game_id === l.current.id && d.round === last.round && d.seat_index === v.seat)?.payload.card as number[] | undefined;
      const line = card ? bingo.bingoLine(card, last.state.called) : null;
      if (!line) throw new PartyError("no_bingo", 409);
      await save({ ...last.state, phase: "done", winner: v.seat, line });
      return {};
    }
    case "bg_finish": {
      hostOnly();
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      if (!rounds.length) throw new PartyError("no_rounds", 409);
      await recordResults(l, finishingOrder(players, bingoWins(rounds)), {}, "activity");
      return {};
    }
  }
  throw new PartyError("bad_action");
}
