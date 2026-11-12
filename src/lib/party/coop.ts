import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { nightGame } from "@/lib/nights/games";
import { PartyError, recordResults, type Loaded, type Viewer } from "@/lib/party/nights";
import type { ActivityData, DealRow } from "@/lib/party/activities";
import type { BreakAnswer, RunMeta } from "@/lib/break/games/common";
import type { BreakReveal, BreakRound } from "@/lib/break/types";
import {
  COOP_GAMES, coopAccept, coopClose, coopNightWon, coopOpen, coopOutcome, coopRecord, coopRevealView, coopRoundView, isCoopGame,
  type CoopGameId, type CoopResult,
} from "@/lib/coop/rules";

/**
 * Co-op games in a live night (activities "boss-fight", "five-letters",
 * "four-in-a-row", "shuffle-dice"): everyone at the table on one side, on
 * their phones, with the board on the TV. The rules are break mode's games
 * through src/lib/coop/rules.ts.
 *
 * Storage, on the Secret Deal tables (no migration): each co-op game in the
 * lineup slot is one table row in party_deals (seat_index null, `round` = the
 * game's number in this slot) holding the game's state between rounds (the
 * meta), the round on screen and its secret (a Five Letters word: the row is
 * never sent to a phone as is). Answers are party_votes, one per seat per
 * round of the game (topic "co:<round>"). A round closes as soon as every
 * player has answered, or when the host plays it; the next round opens in the
 * same write, so the table never waits on a reveal screen.
 *
 * Finishing the slot scores it as one shared result for everyone
 * (coopNightWon, recordResults' `shared`): co-op games never move anyone
 * ahead of anyone else.
 */

interface CoopNightState {
  game: CoopGameId;
  /** Rounds opened in this game. */
  turn: number;
  phase: "open" | "done";
  meta: RunMeta;
  view: BreakRound;
  secret: Record<string, unknown>;
  /** The last round's reveal (the final one once the game is done). */
  last: BreakReveal | null;
  outcome: CoopResult | null;
  /** Bosses and words this game used, so the next game in the slot gets new ones. */
  keys: string[];
}

const topic = (turn: number) => `co:${turn}`;
/** party_deals rounds run 1 to 30: at most 30 co-op games in one lineup slot. */
const MAX_GAMES = 30;

function coopRows(l: Loaded, a: ActivityData): { row: DealRow; round: number; state: CoopNightState }[] {
  const gameId = l.current.id;
  return a.deals.filter((d) => d.game_id === gameId && d.seat_index === null).sort((x, y) => x.round - y.round)
    .map((t) => ({ row: t, round: t.round, state: t.payload as unknown as CoopNightState }));
}

/** The co-op game as this viewer may see it: the round and the board, never the secret. */
export function coopNightView(l: Loaded, a: ActivityData, v: Viewer, players: number[]) {
  const slug = l.current.game_slug as CoopGameId;
  const info = COOP_GAMES[slug];
  const rows = coopRows(l, a);
  const last = rows[rows.length - 1] ?? null;
  const mySeat = v.seat !== null && players.includes(v.seat) ? v.seat : null;
  let current = null;
  if (last) {
    const s = last.state;
    const votes = a.votes.filter((x) => x.game_id === l.current.id && x.round === last.round && x.topic === topic(s.turn));
    const mine = s.phase === "open" && mySeat !== null ? votes.find((x) => x.voter_seat === mySeat)?.choice.answer : null;
    current = {
      round: last.round,
      turn: s.turn,
      phase: s.phase,
      view: coopRoundView(s.view),
      last: s.last ? coopRevealView(s.last) : null,
      answered: s.phase === "open" ? votes.map((x) => x.voter_seat).filter((seat) => players.includes(seat)) : [],
      mine: typeof mine === "string" ? mine : null,
      outcome: s.outcome,
    };
  }
  const results = rows.map((r) => r.state.outcome).filter((x): x is CoopResult => !!x);
  return {
    slug,
    label: nightGame(slug)?.label ?? info.name,
    ready: a.ready,
    players,
    totalRounds: nightGame(slug)?.defaultLength ?? 1,
    game: { name: info.name, noun: info.noun, nouns: info.nouns, how: info.how, roundWord: info.roundWord, maxRounds: info.maxRounds },
    current,
    results,
    record: coopRecord(results),
  };
}

export type CoopAction =
  | { action: "co_start" }
  | { action: "co_answer"; text: string }
  | { action: "co_close" }
  | { action: "co_finish" };

/**
 * Plays the open round: the answers in, judged with what the game remembers,
 * then the next round (or the result). Written only if nobody closed this
 * round first (the row's `turn` still matches), so two phones answering last
 * at the same moment can't play it twice.
 */
async function closeRound(l: Loaded, game: { row: DealRow; round: number; state: CoopNightState }) {
  const svc = createServiceClient();
  const s = game.state;
  const { data, error } = await svc.from("party_votes").select("voter_seat, choice").eq("game_id", l.current.id).eq("round", game.round).eq("topic", topic(s.turn));
  if (error) throw new PartyError("server_error", 500);
  const nameOf = (seat: number) => l.seats.find((x) => x.seat_index === seat)?.display_name ?? `Seat ${seat + 1}`;
  const answers: BreakAnswer[] = ((data ?? []) as { voter_seat: number; choice: { answer?: unknown } }[])
    .filter((x) => typeof x.choice.answer === "string")
    .map((x) => ({ platform: "seat", viewer: String(x.voter_seat), name: nameOf(x.voter_seat), answer: String(x.choice.answer) }));
  const closed = coopClose(s.game, { round: s.view, secret: s.secret }, answers, s.meta, s.turn);
  let next: CoopNightState;
  const opened = closed.outcome ? null : coopOpen(s.game, closed.meta, s.turn);
  if (closed.outcome || !opened) {
    const outcome = closed.outcome ?? coopOutcome(s.game, closed.meta, true);
    next = { ...s, phase: "done", meta: closed.meta, last: closed.judged.reveal, outcome };
  } else {
    next = {
      ...s, turn: s.turn + 1, phase: "open", meta: opened.meta, view: { ...opened.draft.round, openedAt: new Date().toISOString() } as BreakRound,
      secret: opened.draft.secret, last: closed.judged.reveal, keys: [...s.keys, ...(opened.draft.key ? [opened.draft.key] : [])],
    };
  }
  const up = await svc.from("party_deals")
    .update({ payload: next, ...(next.phase === "done" ? { revealed_at: new Date().toISOString() } : {}) })
    .eq("id", game.row.id).eq("payload->>turn", String(s.turn)).eq("payload->>phase", "open")
    .select("id");
  if (up.error) throw new PartyError("server_error", 500);
  // No row: another phone played this round a moment ago. Nothing to do.
}

export async function runCoop(l: Loaded, v: Viewer, body: CoopAction, a: ActivityData, players: number[]): Promise<Record<string, never>> {
  const slug = l.current.game_slug;
  if (!isCoopGame(slug)) throw new PartyError("bad_action");
  const svc = createServiceClient();
  const rows = coopRows(l, a);
  const last = rows[rows.length - 1] ?? null;
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };
  switch (body.action) {
    case "co_start": {
      hostOnly();
      if (!players.length) throw new PartyError("not_playing", 409);
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const round = (last?.round ?? 0) + 1;
      if (round > MAX_GAMES) throw new PartyError("too_many_rounds", 409);
      const used = new Set(rows.flatMap((r) => r.state.keys ?? []));
      const opened = coopOpen(slug, {}, 0, { skip: (k) => used.has(k) });
      if (!opened) throw new PartyError("server_error", 500);
      const state: CoopNightState = {
        game: slug, turn: 1, phase: "open", meta: opened.meta, view: { ...opened.draft.round, openedAt: new Date().toISOString() } as BreakRound,
        secret: opened.draft.secret, last: null, outcome: null, keys: opened.draft.key ? [opened.draft.key] : [],
      };
      const ins = await svc.from("party_deals").insert({ night_id: l.night.id, game_id: l.current.id, round, seat_index: null, payload: state });
      if (ins.error) throw new PartyError(ins.error.code === "23505" ? "stale" : "server_error", ins.error.code === "23505" ? 409 : 500);
      return {};
    }
    case "co_answer": {
      if (v.seat === null || !players.includes(v.seat)) throw new PartyError("not_playing", 403);
      if (!last || last.state.phase !== "open") throw new PartyError("voting_closed", 409);
      const answer = coopAccept(slug, String(body.text ?? "").slice(0, 60), last.state.view);
      if (!answer) throw new PartyError("not_an_answer");
      const up = await svc.from("party_votes").upsert(
        { night_id: l.night.id, game_id: l.current.id, round: last.round, topic: topic(last.state.turn), voter_seat: v.seat, choice: { answer } },
        { onConflict: "game_id,round,topic,voter_seat" },
      );
      if (up.error) throw new PartyError("server_error", 500);
      // Everyone's in: play the round now. Read the answers again after saving this one, so when the
      // last two arrive together the later one sees both (the round's guard stops a double play).
      const { data: inNow, error: readErr } = await svc.from("party_votes").select("voter_seat")
        .eq("game_id", l.current.id).eq("round", last.round).eq("topic", topic(last.state.turn));
      if (readErr) throw new PartyError("server_error", 500);
      const answered = new Set(((inNow ?? []) as { voter_seat: number }[]).map((x) => x.voter_seat));
      if (players.every((p) => answered.has(p))) await closeRound(l, last);
      return {};
    }
    case "co_close": {
      // The host plays the round with whatever's in (someone stepped away, or the table agreed out loud).
      hostOnly();
      if (!last || last.state.phase !== "open") throw new PartyError("stale", 409);
      await closeRound(l, last);
      return {};
    }
    case "co_finish": {
      hostOnly();
      if (last && last.state.phase !== "done") throw new PartyError("round_open", 409);
      const results = rows.map((r) => r.state.outcome).filter((x): x is CoopResult => !!x);
      if (!results.length || !players.length) throw new PartyError("no_rounds", 409);
      await recordResults(l, players, {}, "activity", { won: coopNightWon(results) });
      return {};
    }
  }
  throw new PartyError("bad_action");
}
