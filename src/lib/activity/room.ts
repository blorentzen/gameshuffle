/**
 * The play-together room in the Discord Activity (server only). Rules and
 * the page's view types are in roomRules.ts.
 *
 * The room is keyed by the Activity instance Discord confirmed at sign-in
 * (session `ins`). Nothing runs on a timer: every screen polls while its Play
 * together tab is open, and each poll moves the room along if a phase is over
 * (`step`). Every change is written with the version it was based on, so when
 * two screens try the same step only one lands; the other just reads the
 * result. Scores live in the room's state and change in the same write as the
 * reveal that earned them.
 *
 * Quick-fire rounds reuse break mode's games unchanged (make → accept →
 * judge), with the room's players in place of a stream's chat.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ActivitySession } from "@/lib/activity/session";
import { GAMES } from "@/lib/break/games";
import { publicPuzzles, puzzleOrder } from "@/lib/break/games/facts";
import type { BreakAnswer, RoundDraft } from "@/lib/break/games/common";
import { BREAK_GAMES, type BreakGameId, type BreakReveal, type BreakRound } from "@/lib/break/types";
import { CHAT_GAMES, getChatGame } from "@/lib/twitch/chatGames";
import { CHAT_SETUPS } from "@/lib/twitch/chatSetups";
import type { ChatRoll } from "@/lib/twitch/chatRoll";
import {
  PARTY_NAMES, PARTY_SLUGS, PartyRuleError, partyAction, partyScores, partyTick, partyView, seatEveryone,
  type PartyAct, type PartySecret, type PartySlug, type PartyState,
} from "./roomParty";
import {
  BRAIN_BOARD_COUNTS, BRAIN_FIND_SECONDS, BRAIN_STRIKES, boardCleared, brainPool, freshSlots, judgeBrainGuess, loadBrainBoard, pickBrainBoards, revealAll,
  type BrainSecret, type BrainState,
} from "./roomBrain";
import {
  ACTIVE_MS, ANSWER_GRACE_MS, HOST_STALE_MS, INTRO_SECONDS, MAX_PLAYERS, QUICKFIRE_FOCUS, QUICKFIRE_FOCUS_IDS, QUICKFIRE_SETS,
  QUICKFIRE_SET_IDS, REVEAL_SECONDS, ROUND_COUNTS, RUSH_ROUNDS, addPoints, everyoneAnswered, lineupFor, ranked,
  type QuickfireFocus, type QuickfireSetId, type RoomGame, type RoomPeek, type RoomPlayer, type RoomView,
} from "./roomRules";

export class RoomError extends Error {
  constructor(public code: string) { super(code); }
}

interface QuickfireState {
  kind: "quickfire";
  set: QuickfireSetId;
  focus: QuickfireFocus;
  rounds: number;
  lineup: BreakGameId[];
  /** The room's round number when this game started. Round numbers only ever go up in a room, so
   *  answers (keyed by round) from an earlier game can never count in this one. */
  base: number;
  scores: Record<string, number>;
  round: { game: BreakGameId; view: BreakRound; reveal: BreakReveal | null } | null;
  lastPoints: { id: string; name: string; points: number }[];
  /** Items this room has already played (no repeats in an evening). */
  seen: string[];
}

interface RollState {
  kind: "roll";
  slug: string;
  arg: string;
  rolls: Record<string, { roll: ChatRoll; rerolls: number }>;
  setup: ChatRoll | null;
  seen: string[];
}

type RoomState = QuickfireState | RollState | PartyState | BrainState | { kind?: undefined; seen?: string[] };

interface RoomRow {
  instance_id: string;
  guild_id: string | null;
  channel_id: string | null;
  host_identity: string | null;
  game: RoomGame | null;
  phase: string;
  round_no: number;
  state: RoomState;
  secret: Record<string, unknown>;
  phase_ends_at: string | null;
  version: number;
  updated_at: string;
}

interface PlayerRow { identity_id: string; name: string; avatar_url: string | null; last_seen_at: string }

const ROOM_COLS = "instance_id, guild_id, channel_id, host_identity, game, phase, round_no, state, secret, phase_ends_at, version, updated_at";
const SEEN_CAP = 400;
const at = (ms: number) => new Date(ms).toISOString();
const isActive = (p: PlayerRow, now: number) => now - Date.parse(p.last_seen_at) < ACTIVE_MS;
const discordAvatar = (s: ActivitySession) => (s.avatar ? `https://cdn.discordapp.com/avatars/${s.did}/${s.avatar}.png?size=64` : null);

let readyCache: { ok: boolean; at: number } | null = null;
/** Whether the migration has run (activity-rooms-m1.sql). */
export async function roomReady(): Promise<boolean> {
  if (readyCache && Date.now() - readyCache.at < 60_000) return readyCache.ok;
  const { error } = await createServiceClient().from("activity_rooms").select("instance_id").limit(1);
  readyCache = { ok: !error, at: Date.now() };
  return !error;
}

async function loadRoom(id: string): Promise<RoomRow | null> {
  const { data } = await createServiceClient().from("activity_rooms").select(ROOM_COLS).eq("instance_id", id).maybeSingle();
  return (data as RoomRow | null) ?? null;
}

async function loadPlayers(id: string): Promise<PlayerRow[]> {
  const { data } = await createServiceClient().from("activity_room_players").select("identity_id, name, avatar_url, last_seen_at")
    .eq("instance_id", id).order("joined_at").limit(MAX_PLAYERS * 2);
  return (data ?? []) as PlayerRow[];
}

/** Writes a change only if nobody else changed the room since `row` was read. Null = someone did. */
async function claim(row: RoomRow, patch: Partial<Omit<RoomRow, "instance_id" | "version">>): Promise<RoomRow | null> {
  const { data } = await createServiceClient().from("activity_rooms")
    .update({ ...patch, version: row.version + 1, updated_at: at(Date.now()) })
    .eq("instance_id", row.instance_id).eq("version", row.version)
    .select(ROOM_COLS).maybeSingle();
  return (data as RoomRow | null) ?? null;
}

/** The room for this session, made if it's the first look, with this player checked in. */
async function enter(s: ActivitySession): Promise<{ row: RoomRow; players: PlayerRow[] }> {
  if (!s.ins) throw new RoomError("no_room");
  const admin = createServiceClient();
  let row = await loadRoom(s.ins);
  if (!row) {
    // Tidy rooms nobody has touched in two days, then open this one.
    void admin.from("activity_rooms").delete().lt("updated_at", at(Date.now() - 2 * 864e5)).then(() => {}, () => {});
    await admin.from("activity_rooms").upsert(
      { instance_id: s.ins, guild_id: s.gid ?? null, channel_id: s.cid ?? null, host_identity: s.iid },
      { onConflict: "instance_id", ignoreDuplicates: true },
    );
    row = await loadRoom(s.ins);
    if (!row) throw new RoomError("busy");
  }
  let players = await loadPlayers(s.ins);
  const now = Date.now();
  const me = players.find((p) => p.identity_id === s.iid);
  if (!me) {
    if (players.filter((p) => isActive(p, now)).length >= MAX_PLAYERS) throw new RoomError("full");
    await admin.from("activity_room_players").upsert(
      { instance_id: s.ins, identity_id: s.iid, name: s.name.slice(0, 64) || "Player", avatar_url: discordAvatar(s), last_seen_at: at(now) },
      { onConflict: "instance_id,identity_id" },
    );
    players = await loadPlayers(s.ins);
  } else if (now - Date.parse(me.last_seen_at) > 8_000) {
    // Check in (not on every poll: a few seconds' accuracy is plenty).
    await admin.from("activity_room_players").update({ last_seen_at: at(now), name: s.name.slice(0, 64) || me.name, avatar_url: discordAvatar(s) ?? me.avatar_url })
      .eq("instance_id", s.ins).eq("identity_id", s.iid);
    me.last_seen_at = at(now);
  }
  // Nobody running the room (or they've left): whoever looks in takes over.
  const host = players.find((p) => p.identity_id === row!.host_identity);
  if (!row.host_identity || !host || now - Date.parse(host.last_seen_at) > HOST_STALE_MS) {
    if (row.host_identity !== s.iid) row = (await claim(row, { host_identity: s.iid })) ?? (await loadRoom(s.ins)) ?? row;
  }
  return { row, players };
}

// ── Quick-fire ───────────────────────────────────────────────────────────────

async function answersFor(row: RoomRow): Promise<{ identity_id: string; answer: string; answered_at: string }[]> {
  const { data } = await createServiceClient().from("activity_room_answers").select("identity_id, answer, answered_at")
    .eq("instance_id", row.instance_id).eq("round_no", row.round_no).limit(5000);
  return (data ?? []) as { identity_id: string; answer: string; answered_at: string }[];
}

/** Rounds this game has opened so far. */
const played = (row: RoomRow, st: QuickfireState) => row.round_no - (st.base ?? 0);

async function partyAnswers(instance: string, roundNo: number): Promise<{ identity_id: string; slot: string; answer: string }[]> {
  const { data } = await createServiceClient().from("activity_room_answers").select("identity_id, slot, answer")
    .eq("instance_id", instance).eq("round_no", roundNo).limit(500);
  return (data ?? []) as { identity_id: string; slot: string; answer: string }[];
}

/** Makes the round for this game, lighter on repeats; null when it has nothing to show. */
async function makeRound(id: BreakGameId, st: QuickfireState): Promise<RoundDraft | null> {
  const game = GAMES[id];
  const focus = QUICKFIRE_FOCUS[st.focus];
  const all = publicPuzzles().map((p) => p.id);
  const puzzles = focus.puzzles ? all.filter((p) => focus.puzzles!.includes(p)) : puzzleOrder(null);
  const seen = new Set(st.seen);
  const data = game.load
    ? await game.load({ communityId: "", ownerUserId: "", streamer: "", liveSlug: null, gameOnStream: focus.game, skip: (k) => seen.has(k) }).catch(() => null)
    : undefined;
  if (game.load && data == null) return null;
  const base = { puzzles: puzzles.length ? puzzles : all, streamer: "your group", gameOnStream: focus.game, rand: Math.random, meta: {}, fresh: true, roundOfGame: 1, data };
  return game.make({ ...base, skip: (k) => seen.has(k) }) ?? game.make({ ...base, skip: () => false });
}

async function openRound(row: RoomRow, st: QuickfireState): Promise<RoomRow | null> {
  // This round's game, or the next one in the set that has something to show.
  let draft: RoundDraft | null = null;
  let id = st.lineup[played(row, st)];
  for (const candidate of [id, ...QUICKFIRE_SETS[st.set].games.filter((g) => g !== id)]) {
    draft = await makeRound(candidate, st);
    if (draft) { id = candidate; break; }
  }
  if (!draft) return claim(row, { phase: "done", phase_ends_at: null, state: { ...st, round: null } });
  const now = Date.now();
  const seconds = draft.seconds ?? BREAK_GAMES[id].seconds;
  return claim(row, {
    phase: "open",
    round_no: row.round_no + 1,
    phase_ends_at: at(now + seconds * 1000),
    state: { ...st, round: { game: id, view: { ...draft.round, openedAt: at(now) } as BreakRound, reveal: null }, lastPoints: [], seen: [...st.seen, ...(draft.key ? [draft.key] : [])].slice(-SEEN_CAP) },
    secret: draft.secret,
  });
}

async function closeRound(row: RoomRow, st: QuickfireState, players: PlayerRow[]): Promise<RoomRow | null> {
  const r = st.round;
  if (!r) return claim(row, { phase: "reveal", phase_ends_at: at(Date.now() + REVEAL_SECONDS * 1000) });
  const names = new Map(players.map((p) => [p.identity_id, p.name]));
  const answers: BreakAnswer[] = (await answersFor(row)).map((a) => ({
    platform: "discord", viewer: a.identity_id, name: names.get(a.identity_id) ?? null, answer: a.answer, at: Date.parse(a.answered_at),
  }));
  const judged = GAMES[r.game].judge({ round: r.view, secret: row.secret ?? {} }, answers, {});
  const points = new Map<string, number>();
  for (const a of judged.awards) points.set(a.viewer, (points.get(a.viewer) ?? 0) + a.points);
  const awards = [...points].map(([id, pts]) => ({ id, points: pts }));
  return claim(row, {
    phase: "reveal",
    phase_ends_at: at(Date.now() + REVEAL_SECONDS * 1000),
    state: {
      ...st,
      scores: addPoints(st.scores, awards),
      round: { ...r, reveal: judged.reveal },
      lastPoints: awards.filter((a) => a.points > 0).map((a) => ({ ...a, name: names.get(a.id) ?? "Someone" })).sort((a, b) => b.points - a.points),
    },
  });
}

async function stepQuickfire(row: RoomRow, st: QuickfireState, players: PlayerRow[], now: number): Promise<RoomRow | null> {
  const over = row.phase_ends_at ? now >= Date.parse(row.phase_ends_at) : false;
  if (row.phase === "intro" && over) return openRound(row, st);
  if (row.phase === "open") {
    const multi = !!(st.round && GAMES[st.round.game].multiAnswer);
    if (now >= Date.parse(row.phase_ends_at ?? at(now)) + ANSWER_GRACE_MS) return closeRound(row, st, players);
    if (!multi) {
      const answered = new Set((await answersFor(row)).map((a) => a.identity_id));
      const active = players.filter((p) => isActive(p, now)).map((p) => p.identity_id);
      if (everyoneAnswered(active, answered)) return closeRound(row, st, players);
    }
    return null;
  }
  if (row.phase === "reveal" && over) {
    if (played(row, st) >= st.rounds) return claim(row, { phase: "done", phase_ends_at: null });
    return claim(row, { phase: "intro", phase_ends_at: at(now + INTRO_SECONDS * 1000), state: { ...st, round: null } });
  }
  return null;
}

// ── Roll for the call ────────────────────────────────────────────────────────

function rollFor(slug: string, arg: string, taken: string[]): ChatRoll | null {
  const game = getChatGame(slug);
  if (!game || game.streamerOnly) return null;
  return game.roll({ owned: null, arg, taken });
}

/** Everyone here gets a pick (a newcomer included); unique games keep picks different. */
async function stepRoll(row: RoomRow, st: RollState, players: PlayerRow[], now: number): Promise<RoomRow | null> {
  const missing = players.filter((p) => isActive(p, now) && !st.rolls[p.identity_id]);
  if (!missing.length) return null;
  const rolls = { ...st.rolls };
  const unique = !!CHAT_GAMES[st.slug]?.unique;
  for (const p of missing) {
    const taken = unique ? Object.values(rolls).map((r) => r.roll.slots[0]?.name).filter(Boolean) as string[] : [];
    const roll = rollFor(st.slug, st.arg, taken);
    if (roll) rolls[p.identity_id] = { roll, rerolls: 0 };
  }
  return claim(row, { state: { ...st, rolls } });
}

// ── Chat Brain boards ────────────────────────────────────────────────────────

/** Opens the game's next board (or ends the game when there's none left). */
async function openBoard(row: RoomRow, st: BrainState): Promise<RoomRow | null> {
  for (let i = st.boardNo; i < st.boardIds.length; i++) {
    const board = await loadBrainBoard(st.boardIds[i]);
    if (!board) continue;
    return claim(row, {
      phase: "open", phase_ends_at: at(Date.now() + BRAIN_FIND_SECONDS * 1000),
      state: { ...st, boardNo: i, question: board.question, slots: freshSlots(board.answers), strikes: 0, lastFind: null, seen: [...st.seen, `brain:${st.boardIds[i]}`].slice(-400) },
      secret: { answers: board.answers } satisfies BrainSecret,
    });
  }
  return claim(row, { phase: "done", phase_ends_at: null });
}

async function stepBrain(row: RoomRow, st: BrainState, now: number): Promise<RoomRow | null> {
  const over = row.phase_ends_at ? now >= Date.parse(row.phase_ends_at) : false;
  if (!over) return null;
  if (row.phase === "intro") return openBoard(row, st);
  if (row.phase === "open") {
    // The clock ran out: a strike, and three ends the board.
    const strikes = st.strikes + 1;
    if (strikes >= BRAIN_STRIKES) {
      return claim(row, { phase: "reveal", phase_ends_at: at(now + REVEAL_SECONDS * 1000), state: { ...st, strikes, slots: revealAll(st, row.secret as unknown as BrainSecret) } });
    }
    return claim(row, { phase_ends_at: at(now + BRAIN_FIND_SECONDS * 1000), state: { ...st, strikes } });
  }
  if (row.phase === "reveal") {
    if (st.boardNo + 1 >= st.boardIds.length) return claim(row, { phase: "done", phase_ends_at: null });
    return claim(row, { phase: "intro", phase_ends_at: at(now + INTRO_SECONDS * 1000), state: { ...st, boardNo: st.boardNo + 1 } });
  }
  return null;
}

/** One guess on this copy of the room: the new row, "miss"/"found" when nothing changes, or null when another change landed first. */
async function brainGuess(row: RoomRow, s: ActivitySession, text: string): Promise<RoomRow | "miss" | "found" | null> {
  const st = row.state;
  if (st.kind !== "brain" || row.phase !== "open") throw new RoomError("closed");
  const sec = row.secret as unknown as BrainSecret;
  const hit = judgeBrainGuess(text, st, sec);
  if (!hit) return "miss";
  if (hit === "found") return "found";
  const slots = st.slots.map((sl) => (sl.rank === hit.rank ? { ...sl, label: hit.label, finder: { id: s.iid, name: s.name } } : sl));
  const next: BrainState = { ...st, slots, scores: { ...st.scores, [s.iid]: (st.scores[s.iid] ?? 0) + hit.points }, lastFind: { name: s.name, label: hit.label, points: hit.points } };
  if (boardCleared(next)) return claim(row, { phase: "reveal", phase_ends_at: at(Date.now() + REVEAL_SECONDS * 1000), state: next });
  // Every find restarts the clock.
  return claim(row, { phase_ends_at: at(Date.now() + BRAIN_FIND_SECONDS * 1000), state: next });
}

/** Bingo's timer calls the next number when it's due. */
async function stepParty(row: RoomRow, st: PartyState, now: number): Promise<RoomRow | null> {
  const rounds = partyTick(st, { rounds: [], ...(row.secret as Partial<PartySecret>) } as PartySecret, now);
  return rounds ? claim(row, { secret: { rounds } }) : null;
}

async function step(row: RoomRow, players: PlayerRow[]): Promise<RoomRow> {
  const now = Date.now();
  const st = row.state;
  const next = st.kind === "quickfire" ? await stepQuickfire(row, st, players, now)
    : st.kind === "roll" ? await stepRoll(row, st, players, now)
    : st.kind === "party" && row.phase === "playing" ? await stepParty(row, st, now)
    : st.kind === "brain" ? await stepBrain(row, st, now)
    : null;
  return next ?? row;
}

// ── Reading ──────────────────────────────────────────────────────────────────

const CDN_ART = "https://cdn.empac.co/gameshuffle/images/";
/** Discord only loads our own origin: CDN art goes through /images/cdn (next.config.ts). */
const artHere = (src?: string) => (src && src.startsWith(CDN_ART) ? `/images/cdn/${src.slice(CDN_ART.length)}` : src);
const rollHere = (roll: ChatRoll): ChatRoll => ({ ...roll, slots: roll.slots.map((sl) => ({ ...sl, img: artHere(sl.img) })) });
function roundHere(view: BreakRound): BreakRound {
  const r = view as BreakRound & { img?: string; options?: { img?: string | null }[] };
  return {
    ...r,
    ...(typeof r.img === "string" ? { img: artHere(r.img) } : {}),
    ...(Array.isArray(r.options) ? { options: r.options.map((o) => ({ ...o, ...(o.img ? { img: artHere(o.img) } : {}) })) } : {}),
  } as BreakRound;
}

const rollGames = () => Object.keys(CHAT_GAMES).map((slug) => getChatGame(slug)).filter((g): g is NonNullable<typeof g> => !!g && !g.streamerOnly)
  .map((g) => ({ slug: g.slug, title: g.title, choices: g.choices ?? [] }));

async function viewOf(row: RoomRow, players: PlayerRow[], me: string): Promise<RoomView> {
  const now = Date.now();
  const st = row.state;
  const party = st.kind === "party" ? { st, sec: { rounds: [], ...(row.secret as Partial<PartySecret>) } as PartySecret } : null;
  const scores = st.kind === "quickfire" || st.kind === "brain" ? st.scores : party ? partyScores(party.st, party.sec) : {};
  const answers = st.kind === "quickfire" && row.phase === "open" ? await answersFor(row) : [];
  const answered = new Set(answers.map((a) => a.identity_id));
  const shown = players.filter((p) => isActive(p, now) || (scores[p.identity_id] ?? 0) > 0);
  const list: RoomPlayer[] = ranked(shown.map((p) => ({
    id: p.identity_id, name: p.name, avatar: p.avatar_url, active: isActive(p, now), score: scores[p.identity_id] ?? 0, answered: answered.has(p.identity_id),
  })));
  const host = players.find((p) => p.identity_id === row.host_identity);
  let quickfire: RoomView["quickfire"] = null;
  if (st.kind === "quickfire") {
    const r = st.round;
    const game = r ? GAMES[r.game] : null;
    const upcoming = row.phase === "intro" ? st.lineup[played(row, st)] : r?.game;
    const mineRows = answers.filter((a) => a.identity_id === me);
    quickfire = {
      set: st.set, setName: QUICKFIRE_SETS[st.set].name, focus: st.focus, rounds: st.rounds, roundNo: played(row, st),
      game: upcoming ? { id: upcoming, name: BREAK_GAMES[upcoming].name, howTo: BREAK_GAMES[upcoming].howTo } : null,
      round: r && row.phase !== "intro" ? roundHere(r.view) : null,
      reveal: r?.reveal ?? null,
      found: game?.liveAnswers && row.phase === "open" ? [...new Set(answers.map((a) => a.answer))] : null,
      mine: mineRows.length ? mineRows[mineRows.length - 1].answer : null,
      answering: answered.size,
      lastPoints: st.lastPoints,
      oneGuess: !!game?.oneGuess,
    };
  }
  let roll: RoomView["roll"] = null;
  if (st.kind === "roll") {
    const game = CHAT_GAMES[st.slug];
    const setup = CHAT_SETUPS[st.slug];
    const order = new Map(players.map((p, i) => [p.identity_id, i]));
    roll = {
      slug: st.slug, title: game?.title ?? st.slug, noun: game?.noun ?? "pick", arg: st.arg, choices: game?.choices ?? [],
      rolls: Object.entries(st.rolls).filter(([id]) => shown.some((p) => p.identity_id === id))
        .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
        .map(([id, r]) => ({ id, name: players.find((p) => p.identity_id === id)?.name ?? "Player", roll: rollHere(r.roll), rerolls: r.rerolls })),
      setup: st.setup ? rollHere(st.setup) : null,
      setupChoices: setup?.choices ?? null,
      canSetup: !!setup,
    };
  }
  let partyRoom: RoomView["party"] = null;
  if (party) {
    const last = party.sec.rounds[party.sec.rounds.length - 1];
    const rows = last ? await partyAnswers(row.instance_id, last.roundNo) : [];
    const activeIds = players.filter((p) => isActive(p, now)).map((p) => p.identity_id);
    const names = new Map(players.map((p) => [p.identity_id, p.name]));
    partyRoom = {
      slug: party.st.slug, name: PARTY_NAMES[party.st.slug],
      activity: partyView(party.st, party.sec, me, activeIds, rows, artHere),
      mySeat: party.st.seats.includes(me) ? party.st.seats.indexOf(me) : null,
      seatNames: Object.fromEntries(party.st.seats.map((id, i) => [i, names.get(id) ?? `Player ${i + 1}`])),
    };
  }
  return {
    me,
    isHost: row.host_identity === me,
    host: host ? { id: host.identity_id, name: host.name } : null,
    players: list,
    game: row.game,
    phase: row.phase,
    endsAt: row.phase_ends_at,
    serverNow: at(now),
    quickfire,
    roll,
    party: partyRoom,
    brain: st.kind === "brain" && row.phase !== "intro" ? {
      boards: st.boardIds.length, boardNo: st.boardNo, question: st.question, slots: st.slots, strikes: st.strikes, maxStrikes: BRAIN_STRIKES, lastFind: st.lastFind,
    } : st.kind === "brain" ? { boards: st.boardIds.length, boardNo: st.boardNo, question: "", slots: [], strikes: 0, maxStrikes: BRAIN_STRIKES, lastFind: null } : null,
    brainBoards: row.game ? null : (await brainPool()).length,
    rollGames: row.game ? null : rollGames(),
  };
}

/** The room as this player sees it, moved along if a phase is over. */
export async function roomView(s: ActivitySession): Promise<RoomView> {
  const entered = await enter(s);
  const row = await step(entered.row, entered.players);
  return viewOf(row, entered.players, s.iid);
}

/** For the other tabs: is anyone playing together (without checking this player in). */
export async function roomPeek(s: ActivitySession): Promise<RoomPeek | null> {
  if (!s.ins) return null;
  const [row, players] = await Promise.all([loadRoom(s.ins), loadPlayers(s.ins)]);
  if (!row) return { players: 0, game: null, host: null };
  const now = Date.now();
  return { players: players.filter((p) => isActive(p, now)).length, game: row.game, host: players.find((p) => p.identity_id === row.host_identity)?.name ?? null };
}

// ── Doing ────────────────────────────────────────────────────────────────────

export type RoomAction =
  | { action: "quickfire"; set: string; focus: string; rounds: number }
  | { action: "roll"; slug: string; arg?: string }
  | { action: "answer"; text: string }
  | { action: "next" }
  | { action: "lobby" }
  | { action: "again" }
  | { action: "reroll"; who?: string }
  | { action: "setup"; arg?: string }
  | { action: "host"; to: string }
  | { action: "party_start"; slug: string }
  | { action: "brain_start"; boards: number }
  | { action: "brain_guess"; text: string }
  | { action: "party"; act: PartyAct };

const seenOf = (st: RoomState) => st.seen ?? [];

function quickfireStart(row: RoomRow, set: QuickfireSetId, focus: QuickfireFocus, rounds: number, seen: string[]): Partial<RoomRow> {
  return {
    game: "quickfire", phase: "intro", phase_ends_at: at(Date.now() + INTRO_SECONDS * 1000), secret: {},
    state: { kind: "quickfire", set, focus, rounds, lineup: lineupFor(set, rounds), base: row.round_no, scores: {}, round: null, lastPoints: [], seen },
  };
}

/** One party action on this copy of the room; null when another change landed first. */
async function runParty(row: RoomRow, players: PlayerRow[], s: ActivitySession, host: boolean, act: PartyAct): Promise<RoomRow | null> {
  const st = row.state;
  if (st.kind !== "party" || row.phase !== "playing") throw new RoomError("closed");
  if (typeof act.action !== "string") throw new RoomError("bad_request");
  const sec = { rounds: [], ...(row.secret as Partial<PartySecret>) } as PartySecret;
  const last = sec.rounds[sec.rounds.length - 1];
  const answers = last && act.action.endsWith("_reveal") ? await partyAnswers(row.instance_id, last.roundNo) : [];
  const activeIds = players.filter((p) => Date.now() - Date.parse(p.last_seen_at) < ACTIVE_MS).map((p) => p.identity_id);
  let change;
  try {
    change = partyAction(st, sec, act, { me: s.iid, isHost: host, active: activeIds, roundNo: row.round_no, answers });
  } catch (err) {
    if (err instanceof PartyRuleError) throw new RoomError(err.code);
    throw err;
  }
  if (change.kind === "answer") {
    await createServiceClient().from("activity_room_answers").upsert(
      { instance_id: row.instance_id, round_no: last!.roundNo, identity_id: s.iid, slot: change.slot, answer: change.answer, answered_at: at(Date.now()) },
      { onConflict: "instance_id,round_no,identity_id,slot" },
    );
    return row;
  }
  if (change.kind === "finish") return claim(row, { phase: "done" });
  if (change.kind === "settings") return claim(row, { state: { ...st, callSeconds: change.callSeconds } });
  return claim(row, {
    secret: { rounds: change.rounds },
    state: { ...st, ...(change.seats ? { seats: change.seats } : {}), ...(change.seen ? { seen: change.seen } : {}) },
    ...(change.nextRoundNo ? { round_no: row.round_no + 1 } : {}),
  });
}

/** Does one thing in the room, then returns the fresh view. */
export async function roomAct(s: ActivitySession, a: RoomAction): Promise<RoomView> {
  const { row: entered, players } = await enter(s);
  const row = await step(entered, players);
  const host = row.host_identity === s.iid;
  const needHost = () => { if (!host) throw new RoomError("not_host"); };
  const activeIds = () => players.filter((p) => Date.now() - Date.parse(p.last_seen_at) < ACTIVE_MS).map((p) => p.identity_id);
  const st = row.state;
  let next: RoomRow | null = row;

  switch (a.action) {
    case "quickfire": {
      needHost();
      const set = QUICKFIRE_SET_IDS.includes(a.set as QuickfireSetId) ? (a.set as QuickfireSetId) : null;
      const focus = QUICKFIRE_FOCUS_IDS.includes(a.focus as QuickfireFocus) ? (a.focus as QuickfireFocus) : "any";
      const allowed: readonly number[] = set === "rush" ? RUSH_ROUNDS : ROUND_COUNTS;
      if (!set || !allowed.includes(a.rounds)) throw new RoomError("bad_request");
      next = await claim(row, quickfireStart(row, set, focus, a.rounds, seenOf(st)));
      break;
    }
    case "again": {
      needHost();
      if (st.kind === "brain") {
        const ids = await pickBrainBoards(st.boards, st.seen);
        if (!ids.length) throw new RoomError("no_boards");
        next = await claim(row, { phase: "intro", phase_ends_at: at(Date.now() + INTRO_SECONDS * 1000), secret: {}, state: { ...st, boardIds: ids, boardNo: 0, question: "", slots: [], strikes: 0, scores: {}, lastFind: null } });
        break;
      }
      if (st.kind === "party") {
        next = await claim(row, { phase: "playing", secret: { rounds: [] }, state: { ...st, seats: seatEveryone(st.seats, activeIds()) } });
        break;
      }
      if (st.kind !== "quickfire") throw new RoomError("bad_request");
      next = await claim(row, quickfireStart(row, st.set, st.focus, st.rounds, st.seen));
      break;
    }
    case "brain_start": {
      needHost();
      if (!(BRAIN_BOARD_COUNTS as readonly number[]).includes(a.boards)) throw new RoomError("bad_request");
      const ids = await pickBrainBoards(a.boards, seenOf(st));
      if (!ids.length) throw new RoomError("no_boards");
      const state: BrainState = { kind: "brain", boards: ids.length, boardIds: ids, boardNo: 0, question: "", slots: [], strikes: 0, scores: {}, lastFind: null, seen: seenOf(st) };
      next = await claim(row, { game: "brain", phase: "intro", phase_ends_at: at(Date.now() + INTRO_SECONDS * 1000), secret: {}, state });
      break;
    }
    case "brain_guess": {
      const text = String(a.text ?? "").slice(0, 80);
      if (!text.trim()) throw new RoomError("bad_request");
      let cur: RoomRow = row;
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await brainGuess(cur, s, text);
        if (r === "miss" || r === "found") throw new RoomError(r === "found" ? "already_found" : "not_on_board");
        if (r) { next = r; break; }
        cur = await step((await loadRoom(row.instance_id)) ?? cur, players);
        next = null;
      }
      break;
    }
    case "party_start": {
      needHost();
      if (!PARTY_SLUGS.includes(a.slug as PartySlug)) throw new RoomError("bad_request");
      const state: PartyState = { kind: "party", slug: a.slug as PartySlug, seats: seatEveryone([], activeIds()), seen: seenOf(st) };
      next = await claim(row, { game: "party", phase: "playing", phase_ends_at: null, secret: { rounds: [] }, state });
      break;
    }
    case "party": {
      // Bingo's timer can change the room between our read and our write: try again on a fresh copy.
      let cur: RoomRow = row;
      for (let attempt = 0; attempt < 3; attempt++) {
        const done = await runParty(cur, players, s, cur.host_identity === s.iid, (a.act ?? {}) as PartyAct);
        if (done) { next = done; break; }
        cur = await step((await loadRoom(row.instance_id)) ?? cur, players);
        next = null;
      }
      break;
    }
    case "roll": {
      needHost();
      const game = getChatGame(a.slug);
      if (!game || game.streamerOnly) throw new RoomError("bad_request");
      const arg = (a.arg ?? "").slice(0, 40);
      next = await claim(row, { game: "roll", phase: "rolling", phase_ends_at: null, secret: {}, state: { kind: "roll", slug: game.slug, arg, rolls: {}, setup: null, seen: seenOf(st) } });
      if (next) next = (await stepRoll(next, next.state as RollState, players, Date.now())) ?? next;
      break;
    }
    case "answer": {
      if (st.kind !== "quickfire" || row.phase !== "open" || !st.round) throw new RoomError("closed");
      if (Date.now() > Date.parse(row.phase_ends_at ?? at(0)) + ANSWER_GRACE_MS) throw new RoomError("closed");
      const game = GAMES[st.round.game];
      const text = String(a.text ?? "").slice(0, 120);
      const answer = game.accept(text, st.round.view);
      if (!answer) throw new RoomError("not_an_answer");
      const slot = game.multiAnswer ? answer.slice(0, 60) : "";
      await createServiceClient().from("activity_room_answers").upsert(
        { instance_id: row.instance_id, round_no: row.round_no, identity_id: s.iid, slot, answer: answer.slice(0, 120), answered_at: at(Date.now()) },
        { onConflict: "instance_id,round_no,identity_id,slot", ignoreDuplicates: !!game.oneGuess || !!game.multiAnswer },
      );
      // Everyone's in: the round can close straight away.
      next = await step(row, players);
      break;
    }
    case "next": {
      needHost();
      if (st.kind === "brain") {
        // Skip ahead: end this board (or the pause before the next one) now.
        if (row.phase === "open") next = await claim(row, { phase: "reveal", phase_ends_at: at(Date.now() + REVEAL_SECONDS * 1000), state: { ...st, slots: revealAll(st, row.secret as unknown as BrainSecret) } });
        else next = await claim(row, { phase_ends_at: at(Date.now() - 1) }).then((r) => (r ? step(r, players) : null));
        break;
      }
      if (st.kind !== "quickfire") throw new RoomError("bad_request");
      if (row.phase === "open") next = await closeRound(row, st, players);
      else if (row.phase === "intro") next = await openRound(row, st);
      else if (row.phase === "reveal") next = await claim(row, { phase_ends_at: at(Date.now() - 1) }).then((r) => (r ? step(r, players) : null));
      break;
    }
    case "lobby": {
      needHost();
      next = await claim(row, { game: null, phase: "lobby", phase_ends_at: null, secret: {}, state: { seen: seenOf(st) } });
      break;
    }
    case "reroll": {
      if (st.kind !== "roll") throw new RoomError("bad_request");
      const who = a.who === "all" ? "all" : a.who || s.iid;
      if (who !== s.iid) needHost();
      const ids = who === "all" ? Object.keys(st.rolls) : [who];
      const rolls = { ...st.rolls };
      const unique = !!CHAT_GAMES[st.slug]?.unique;
      if (who === "all") for (const id of ids) delete rolls[id];
      for (const id of ids) {
        const taken = unique ? Object.entries(rolls).filter(([k]) => k !== id).map(([, r]) => r.roll.slots[0]?.name).filter(Boolean) as string[] : [];
        const roll = rollFor(st.slug, st.arg, taken);
        if (roll) rolls[id] = { roll, rerolls: (st.rolls[id]?.rerolls ?? 0) + (who === "all" ? 0 : 1) };
      }
      next = await claim(row, { state: { ...st, rolls } });
      break;
    }
    case "setup": {
      needHost();
      if (st.kind !== "roll") throw new RoomError("bad_request");
      const setup = CHAT_SETUPS[st.slug];
      if (!setup) throw new RoomError("bad_request");
      const roll = setup.roll({ arg: (a.arg ?? setup.choices?.[0]?.arg ?? "").slice(0, 40), players: Object.keys(st.rolls).length || 1 });
      next = await claim(row, { state: { ...st, setup: roll } });
      break;
    }
    case "host": {
      needHost();
      if (!players.some((p) => p.identity_id === a.to)) throw new RoomError("bad_request");
      next = await claim(row, { host_identity: a.to });
      break;
    }
    default:
      throw new RoomError("bad_request");
  }
  if (!next) throw new RoomError("busy");
  const fresh = (await loadRoom(row.instance_id)) ?? next;
  return viewOf(fresh, await loadPlayers(row.instance_id), s.iid);
}
