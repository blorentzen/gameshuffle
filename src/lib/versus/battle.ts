import "server-only";

/**
 * Trainer battles on the head-to-head rooms (server; battle picks 2026-11-11, all as recommended, with a coin flip for
 * who goes first). Two players each pick a Trainer Road team from the room's group in the lobby (kept on their
 * entrant row as `source.team`, hidden from the other until the start). At Go the battle starts here, in
 * `versus_battles`: both pick 3 cards to bring (seeing the other team), then a lead, then turns alternate on the
 * battle engine (src/lib/originals/duel/battle.ts). Every step is kept, the state is version-guarded, and a clock runs
 * for whoever the battle waits on: no cron, the clock is checked on every read (both players poll). The room's lanes
 * follow the battle (knockouts as the lane's progress, the round as its turn), so the race overlay, bets and results
 * work as they do for races; a battle is won or lost, and the loser is placed second.
 */

import { DUEL_DATA } from "@/lib/originals/duel/data";
import { regionOf, ROAD_REGIONS, teamLabel } from "@/lib/originals/duel/road";
import { trainerView } from "@/lib/originals/duel/store";
import { trainerPicture } from "@/lib/originals/duel/pictures";
import { startState, viewOf, type DuelSetup } from "@/lib/originals/duel/engine";
import {
  BATTLE_RULES, BRING, HAND, applyBattle, battleView, forfeit, makeBattle, other, standing, startBattle, timeOut, waitingOn,
  type BattleSetup, type BattleState, type BattleStep, type Side,
} from "@/lib/originals/duel/battle";
import type { DuelCard, DuelTrainer } from "@/lib/originals/duel/types";
import type { DuelPlayView } from "@/lib/originals/duel/view";
import { createServiceClient } from "@/lib/supabase/admin";
import { roomLane } from "./relay";
import { battleGroupLabel } from "./rules";
import type { BattleGroup, BattleInfo, BattleRunView, BattleTeamView } from "./types";

const db = () => createServiceClient();

/** The bring step's clock, a turn's (and a lead's or a send-out's), and how long a player can be gone. */
export const BRING_MS = 90_000;
export const TURN_MS = 60_000;
export const GONE_MS = 120_000;
/** How often a player's poll is written down as "still here". */
const SEEN_EVERY_MS = 15_000;

// ---- Teams ------------------------------------------------------------------------------------------------------

const cardsOf = (t: DuelTrainer): DuelCard[] => t.team.map((id) => DUEL_DATA.cards[id]).filter((c): c is DuelCard => !!c);

/** A team a battle can use: in the group, with at least as many cards as each player brings. */
export function battleTeam(id: string, group?: BattleGroup): DuelTrainer | null {
  const t = DUEL_DATA.trainers.find((x) => x.id === id);
  if (!t || (group && t.tier !== group) || cardsOf(t).length < BRING) return null;
  return t;
}

export function teamView(t: DuelTrainer): BattleTeamView {
  const cards = cardsOf(t);
  const region = regionOf(t);
  return {
    trainerId: t.id, name: t.name, title: t.title, game: teamLabel(t),
    region: region ? ROAD_REGIONS.find((r) => r.slug === region)?.name ?? null : null,
    cards: cards.map((c) => c.short),
    picture: trainerPicture(t, cards[cards.length - 1] ?? null),
  };
}

let teamCache: Map<BattleGroup, BattleTeamView[]> | null = null;
/** Every team in a group, by region then name (the lobby's picker). */
export function teamsFor(group: BattleGroup): BattleTeamView[] {
  teamCache ??= new Map();
  const hit = teamCache.get(group);
  if (hit) return hit;
  const order = new Map(ROAD_REGIONS.map((r, i) => [r.name, i]));
  const list = DUEL_DATA.trainers.filter((t) => t.tier === group && cardsOf(t).length >= BRING).map(teamView)
    .sort((a, b) => (order.get(a.region ?? "") ?? 99) - (order.get(b.region ?? "") ?? 99) || a.name.localeCompare(b.name) || a.game.localeCompare(b.game));
  teamCache.set(group, list);
  return list;
}

/** A team picked for a player who never picked one. */
export function randomTeam(group: BattleGroup, seed: string): string {
  const list = teamsFor(group);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length].trainerId;
}

// ---- The record --------------------------------------------------------------------------------------------------

interface BattlePlayer {
  side: Side;
  team: string;
  /** The cards they bring (indexes into their team), once picked. */
  bring: number[] | null;
  /** Their last poll (epoch ms). */
  seen: number;
  /** The turn each of the other side's cards was knocked out on (the lane's progress). */
  kos: number[];
}
type Phase = "bring" | "play" | "done";
interface Step { by: Side | "clock" | "left"; st?: BattleStep; loser?: Side; at: number }
export interface BattleRow {
  room_id: string;
  phase: Phase;
  players: Record<string, BattlePlayer>;
  setup: BattleSetup | null;
  steps: Step[];
  state: BattleState | null;
  deadline: string | null;
  version: number;
  created_at: string;
}
const COLS = "room_id, phase, players, setup, steps, state, deadline, version, created_at";

let readyYes = false;
let readyNoAt = 0;
/** The battles table exists. */
export async function battleReady(): Promise<boolean> {
  if (readyYes) return true;
  if (Date.now() - readyNoAt < 60_000) return false;
  const { error } = await db().from("versus_battles").select("room_id").limit(1);
  if (!error) return (readyYes = true);
  readyNoAt = Date.now();
  return false;
}

export async function loadBattle(roomId: string): Promise<BattleRow | null> {
  const { data } = await db().from("versus_battles").select(COLS).eq("room_id", roomId).maybeSingle();
  return (data as BattleRow | null) ?? null;
}

/** Writes a battle if nobody moved it since `version` was read. */
async function save(row: BattleRow, patch: Partial<BattleRow>): Promise<BattleRow | null> {
  const next = { ...patch, version: row.version + 1, updated_at: new Date().toISOString() };
  const { data } = await db().from("versus_battles").update(next).eq("room_id", row.room_id).eq("version", row.version).select(COLS).maybeSingle();
  return (data as BattleRow | null) ?? null;
}

interface RoomBits { id: string; room_key: string; code: string; settings: unknown }
const groupOf = (room: RoomBits): BattleGroup => {
  const g = (room.settings as { battle?: { group?: string } } | null)?.battle?.group;
  return g === "elite" || g === "rival" || g === "boss" || g === "champion" ? g : "gym";
};

/**
 * The battle begins (the room's Go): the two players in seat order take sides 0 and 1 with the teams they picked (a
 * random one for anyone who didn't), and the bring step's clock starts.
 */
export async function startBattleRoom(room: RoomBits): Promise<void> {
  if (!(await battleReady())) return;
  const { data } = await db().from("versus_entrants").select("user_id, seat, status, source").eq("room_id", room.id).in("status", ["racing", "done", "out"]).order("seat");
  const rows = ((data ?? []) as { user_id: string; seat: number; source: { team?: string } | null }[]).slice(0, 2);
  if (rows.length < 2) return;
  const group = groupOf(room);
  const now = Date.now();
  const players: Record<string, BattlePlayer> = {};
  rows.forEach((r, i) => {
    const team = r.source?.team && battleTeam(r.source.team, group) ? r.source.team : randomTeam(group, `${room.room_key}:${i}`);
    // A team of exactly 3 has nothing to pick: all three come.
    const t = battleTeam(team);
    const bring = t && cardsOf(t).length === BRING ? [0, 1, 2] : null;
    players[r.user_id] = { side: i as Side, team, bring, seen: now, kos: [] };
  });
  const row: Record<string, unknown> = { room_id: room.id, players, deadline: new Date(now + BRING_MS).toISOString() };
  // Both teams of 3: straight to the leads.
  if (Object.values(players).every((p) => p.bring)) {
    const ids = Object.keys(players).sort((x, y) => players[x].side - players[y].side) as [string, string];
    const names = await namesOf(ids);
    const b = begin({ room_id: room.id, phase: "bring", players, setup: null, steps: [], state: null, deadline: null, version: 0, created_at: new Date(now).toISOString() }, room.room_key, ids.map((id) => names.get(id) ?? "Player") as [string, string]);
    Object.assign(row, { phase: "play", setup: b.setup, state: b.state, deadline: nextDeadline("play", b.state) });
  }
  const { error } = await db().from("versus_battles").insert(row);
  if (error && error.code !== "23505") console.error("[battle] start:", error.message);
}

// ---- Names -------------------------------------------------------------------------------------------------------

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data } = await db().from("users").select("id, display_name, username").in("id", ids);
  for (const u of (data ?? []) as { id: string; display_name: string | null; username: string | null }[]) out.set(u.id, (u.display_name || u.username || "Player").slice(0, 40));
  return out;
}

const bySide = (row: BattleRow): [string, string] => {
  const ids = Object.keys(row.players);
  const a = ids.find((id) => row.players[id].side === 0)!;
  const b = ids.find((id) => row.players[id].side === 1)!;
  return [a, b];
};

// ---- Moving the battle -------------------------------------------------------------------------------------------

/** Both players brought their cards: the battle's setup (cards frozen), with the coin and both leads still to pick. */
function begin(row: BattleRow, roomKey: string, names: [string, string]): { setup: BattleSetup; state: BattleState } {
  const [a, b] = bySide(row);
  const brought = (id: string): DuelCard[] => {
    const t = battleTeam(row.players[id].team);
    const cards = t ? cardsOf(t) : [];
    return (row.players[id].bring ?? [0, 1, 2]).map((i) => cards[i]).filter(Boolean).slice(0, BRING);
  };
  const setup = makeBattle(roomKey, names, [brought(a), brought(b)]);
  return { setup, state: startBattle(setup) };
}

/** The cards with the most HP, for a player who ran out of time in the bring step. */
function strongest(teamId: string): number[] {
  const t = battleTeam(teamId);
  const cards = t ? cardsOf(t) : [];
  return cards.map((c, i) => ({ i, hp: c.hp })).sort((x, y) => y.hp - x.hp || x.i - y.i).slice(0, BRING).map((x) => x.i).sort((x, y) => x - y);
}

/** Whose clock it is, and the deadline that goes with the new state. */
const nextDeadline = (phase: Phase, s: BattleState | null) => (phase === "done" || (s && s.over != null) ? null : new Date(Date.now() + (phase === "bring" ? BRING_MS : TURN_MS)).toISOString());

/**
 * The clock and who's still here, checked on every read: a bring step that ran out picks the strongest cards; a turn
 * that ran out plays itself (battle.ts timeOut); a player gone longer than GONE_MS loses. Returns the battle as it
 * stands after that (re-read when someone else moved it first).
 */
async function tick(room: RoomBits, row: BattleRow, viewerId: string | null): Promise<BattleRow> {
  let cur = row;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cur.phase === "done") return cur;
    const now = Date.now();
    const players = { ...cur.players };
    let touched = false;
    if (viewerId && players[viewerId] && now - players[viewerId].seen > SEEN_EVERY_MS) {
      players[viewerId] = { ...players[viewerId], seen: now };
      touched = true;
    }
    const late = cur.deadline != null && Date.parse(cur.deadline) <= now;
    const gone = cur.phase === "play" ? Object.keys(players).find((id) => now - players[id].seen > GONE_MS) : undefined;
    if (!late && !gone) {
      if (!touched) return cur;
      const saved = await save(cur, { players });
      if (saved) return saved;
      cur = (await loadBattle(room.id)) ?? cur;
      continue;
    }
    let patch: Partial<BattleRow> = { players };
    if (cur.phase === "bring") {
      for (const id of Object.keys(players)) if (!players[id].bring) players[id] = { ...players[id], bring: strongest(players[id].team) };
      const names = await namesOf(bySide(cur));
      const b = begin({ ...cur, players }, room.room_key, bySide(cur).map((id) => names.get(id) ?? "Player") as [string, string]);
      patch = { ...patch, phase: "play", setup: b.setup, state: b.state, deadline: nextDeadline("play", b.state) };
    } else if (cur.setup && cur.state) {
      const steps = [...cur.steps];
      let s = cur.state;
      if (gone) {
        const loser = players[gone].side;
        s = forfeit(s, loser);
        steps.push({ by: "left", loser, at: now });
      } else {
        s = timeOut(cur.setup, s);
        steps.push({ by: "clock", at: now });
      }
      noteKos(cur.state, s, players);
      patch = { ...patch, state: s, steps, phase: s.over != null ? "done" : "play", deadline: nextDeadline(s.over != null ? "done" : "play", s) };
    }
    const saved = await save(cur, patch);
    if (saved) {
      await lanes(room, saved);
      return saved;
    }
    cur = (await loadBattle(room.id)) ?? cur;
  }
  return cur;
}

/** Writes down the round of each knockout, on the side that made it (the lanes' progress). */
function noteKos(before: BattleState, after: BattleState, players: Record<string, BattlePlayer>) {
  for (const id of Object.keys(players)) {
    const me = players[id].side;
    const was = before.sides[other(me)].slots.filter((c) => c.out).length;
    const now = after.sides[other(me)].slots.filter((c) => c.out).length;
    if (now > was) players[id] = { ...players[id], kos: [...players[id].kos, ...Array.from({ length: now - was }, () => after.turn)] };
  }
}

/** The room's lanes follow the battle: knockouts so far and the round; at the end, the winner done and the loser out. */
async function lanes(room: RoomBits, row: BattleRow) {
  if (!row.state) return;
  const s = row.state;
  const elapsed = Date.now() - Date.parse(row.created_at);
  await Promise.all(Object.entries(row.players).map(async ([id, p]) => {
    const lane: Record<string, unknown> = { reached: p.kos.length, times: [0, 1, 2].map((k) => p.kos[k] ?? null), current: Math.max(1, s.turn) };
    if (s.over != null) {
      const won = s.over === p.side || s.over === "draw";
      Object.assign(lane, won ? { status: "done", finalMs: Math.max(1, s.turn), tieMs: elapsed } : { status: "out", reason: s.why === "left" ? "left" : "lost", tieMs: elapsed });
    }
    const res = await roomLane(room.room_key, id, lane);
    if (!res.ok) console.warn(`[battle] lane for ${room.code}: ${res.error}`);
  }));
}

export type BattleStepBody = { bring: number[] } | BattleStep;
export type BattleStepResult = { ok: true; run: BattleRunView } | { ok: false; error: "not_found" | "not_in" | "not_now" | "illegal" | "busy" };

/** One step from a player: their bring, their lead, a send-out, or a turn. */
export async function battleStep(room: RoomBits, userId: string, body: BattleStepBody): Promise<BattleStepResult> {
  let row = await loadBattle(room.id);
  if (!row) return { ok: false, error: "not_found" };
  row = await tick(room, row, userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = row.players[userId];
    if (!p) return { ok: false, error: "not_in" };
    if (row.phase === "done") return { ok: false, error: "not_now" };
    const players = { ...row.players, [userId]: { ...p, seen: Date.now() } };
    let patch: Partial<BattleRow>;
    if ("bring" in body) {
      if (row.phase !== "bring" || p.bring) return { ok: false, error: "not_now" };
      const team = battleTeam(p.team);
      const n = team ? cardsOf(team).length : 0;
      const picks = Array.isArray(body.bring) ? [...new Set(body.bring)] : [];
      if (picks.length !== BRING || picks.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) return { ok: false, error: "illegal" };
      players[userId] = { ...players[userId], bring: picks };
      patch = { players };
      if (Object.values(players).every((x) => x.bring)) {
        const names = await namesOf(bySide(row));
        const b = begin({ ...row, players }, room.room_key, bySide(row).map((id) => names.get(id) ?? "Player") as [string, string]);
        patch = { players, phase: "play", setup: b.setup, state: b.state, deadline: nextDeadline("play", b.state) };
      }
    } else {
      if (row.phase !== "play" || !row.setup || !row.state) return { ok: false, error: "not_now" };
      const next = applyBattle(row.setup, row.state, p.side, body);
      if (!next) return { ok: false, error: "illegal" };
      noteKos(row.state, next, players);
      const steps = [...row.steps, { by: p.side, st: body, at: Date.now() }];
      // The clock starts again whenever the battle waits on someone new (a lead waits for both).
      const waitingBefore = waitingOn(row.state).join();
      const waitingNow = waitingOn(next).join();
      const deadline = next.over != null ? null : waitingBefore !== waitingNow || "act" in body ? nextDeadline("play", next) : row.deadline;
      patch = { players, state: next, steps, phase: next.over != null ? "done" : "play", deadline };
    }
    const saved = await save(row, patch);
    if (saved) {
      if (saved.phase !== "bring") await lanes(room, saved);
      return { ok: true, run: await runView(room, saved, userId) };
    }
    row = (await loadBattle(room.id)) ?? row;
  }
  return { ok: false, error: "busy" };
}

/** A player forfeits (Leave on a running battle): the other player wins. */
export async function forfeitBattle(room: RoomBits, userId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await loadBattle(room.id);
    if (!row || !row.players[userId] || row.phase === "done") return false;
    const loser = row.players[userId].side;
    let patch: Partial<BattleRow>;
    if (row.phase === "bring" || !row.setup || !row.state) {
      // Before the cards are in: a battle with no turns, the other player the winner.
      const names = await namesOf(bySide(row));
      const b = begin({ ...row, players: Object.fromEntries(Object.entries(row.players).map(([id, p]) => [id, { ...p, bring: p.bring ?? strongest(p.team) }])) }, room.room_key, bySide(row).map((id) => names.get(id) ?? "Player") as [string, string]);
      patch = { setup: b.setup, state: forfeit(b.state, loser), steps: [{ by: "left", loser, at: Date.now() }], phase: "done", deadline: null };
    } else {
      patch = { state: forfeit(row.state, loser), steps: [...row.steps, { by: "left", loser, at: Date.now() }], phase: "done", deadline: null };
    }
    const saved = await save(row, patch);
    if (saved) { await lanes(room, saved); return true; }
  }
  return false;
}

// ---- What a player (or a watcher) sees ------------------------------------------------------------------------------

/** The battle for a viewer (a player, or anyone watching), after the clock is checked. */
export async function battleRunView(room: RoomBits, viewerId: string | null): Promise<BattleRunView | null> {
  const row0 = await loadBattle(room.id);
  if (!row0) return null;
  const row = await tick(room, row0, viewerId);
  return runView(room, row, viewerId);
}

/** This pair's battles: how many each won (the head-to-head line), this one included (its room may not be marked
 *  finished yet when the last step lands). */
async function pairRecord(a: string, b: string, roomId: string, thisOne: "won" | "lost" | "draw" | null): Promise<{ won: number; lost: number }> {
  const { data } = await db().from("versus_entrants").select("room_id, user_id, place, versus_rooms!inner(kind, status)")
    .in("user_id", [a, b]).eq("versus_rooms.kind", "battle").eq("versus_rooms.status", "finished").limit(400);
  const rows = (data ?? []) as unknown as { room_id: string; user_id: string; place: number | null }[];
  const byRoom = new Map<string, Map<string, number | null>>();
  for (const r of rows) {
    const m = byRoom.get(r.room_id) ?? new Map<string, number | null>();
    m.set(r.user_id, r.place);
    byRoom.set(r.room_id, m);
  }
  let won = 0;
  let lost = 0;
  byRoom.delete(roomId);
  if (thisOne === "won") won++;
  else if (thisOne === "lost") lost++;
  for (const m of byRoom.values()) {
    if (!m.has(a) || !m.has(b)) continue;
    if (m.get(a) === 1 && m.get(b) !== 1) won++;
    else if (m.get(b) === 1 && m.get(a) !== 1) lost++;
  }
  return { won, lost };
}

async function runView(room: RoomBits, row: BattleRow, viewerId: string | null): Promise<BattleRunView> {
  const [a, b] = bySide(row);
  const names = await namesOf([a, b]);
  const nameOf = (id: string) => names.get(id) ?? "Player";
  const playerSide = viewerId && row.players[viewerId] ? row.players[viewerId].side : null;
  const me: Side = playerSide ?? 0;
  const myId = me === 0 ? a : b;
  const theirId = me === 0 ? b : a;
  const myTeam = battleTeam(row.players[myId].team)!;
  const theirTeam = battleTeam(row.players[theirId].team)!;
  const spectator = playerSide == null;
  const s = row.state;
  const setup = row.setup;

  let play: DuelPlayView;
  if (row.phase === "bring" || !setup || !s) {
    // The bring step: your whole team and theirs, in the Daily Duel's bring picker.
    const dsetup: DuelSetup = { you: cardsOf(myTeam), foe: cardsOf(theirTeam), row: [], events: [], signature: "energy2", trainer: nameOf(theirId), rules: BATTLE_RULES, bring: BRING, hand: HAND };
    const ds = startState(dsetup);
    // Nobody has led yet.
    ds.fi = -1;
    if (row.players[myId].bring) ds.brought = row.players[myId].bring!;
    play = viewOf(dsetup, ds, { name: nameOf(theirId), signature: { title: "", effect: "energy2" } });
    play.needsNext = false;
    play.nexts = [];
    if (spectator) play.needsBring = false;
  } else {
    play = battleView(setup, s, me, spectator);
  }

  const waitingSides = s && row.phase === "play" ? waitingOn(s) : row.phase === "bring" ? (Object.values(row.players).filter((p) => !p.bring).map((p) => p.side) as Side[]) : [];
  const waiting: BattleInfo["waiting"] = !waitingSides.length ? null : waitingSides.length === 2 ? "both" : waitingSides[0] === me ? "you" : "them";
  const over = s?.over ?? null;
  const result: BattleInfo["result"] = over == null ? null : over === "draw" ? "draw" : spectator ? null : over === me ? "won" : "lost";
  const winner = over == null || over === "draw" ? null : nameOf(over === 0 ? a : b);
  const first = setup && s && s.turn > 0 ? { name: nameOf(setup.first === 0 ? a : b), you: !spectator && setup.first === me } : null;
  const t = trainerView(theirTeam, cardsOf(theirTeam).slice(-1)[0] ?? null);

  const info: BattleInfo = {
    phase: row.phase,
    deadline: row.deadline ? Date.parse(row.deadline) : null,
    waiting: spectator && waiting ? "both" : waiting,
    first,
    // A watcher's "you" is the first player (the page names both).
    you: { name: nameOf(myId), team: teamView(myTeam), missed: s ? s.sides[me].missed : 0 },
    them: { name: nameOf(theirId), team: teamView(theirTeam), missed: s ? s.sides[other(me)].missed : 0 },
    brought: { you: !!row.players[myId].bring, them: !!row.players[theirId].bring },
    result,
    why: s?.why ?? null,
    winner,
    record: !spectator && row.phase === "done" ? await pairRecord(myId, theirId, room.id, result) : null,
    spectator,
    code: room.code,
    version: row.version,
  };
  return {
    id: room.code, day: "", number: 0, official: true,
    status: row.phase === "done" ? "done" : "playing",
    trainer: { ...t, name: nameOf(theirId), title: `${theirTeam.name}'s team` },
    play,
    result: result === "won" ? "won" : result === "lost" ? "lost" : null,
    turns: s?.turn ?? 0,
    cardsLeft: s ? standing(s.sides[me]) : BRING,
    par: null, points: null, seconds: null,
    startedAt: row.created_at,
    serverNow: new Date().toISOString(),
    board: null, score: null, scoring: "points", asked: false, level: "normal", share: null, bag: null,
    battle: info,
  };
}

/** A player's battles (won and lost) for their trainer card. */
export async function battleRecord(userId: string): Promise<{ won: number; lost: number } | null> {
  if (!(await battleReady())) return null;
  const { data } = await db().from("versus_entrants").select("place, versus_rooms!inner(kind, status)")
    .eq("user_id", userId).eq("versus_rooms.kind", "battle").eq("versus_rooms.status", "finished").limit(1000);
  const rows = (data ?? []) as { place: number | null }[];
  return { won: rows.filter((r) => r.place === 1).length, lost: rows.filter((r) => r.place !== 1).length };
}

export const groupLabelOf = (room: RoomBits) => battleGroupLabel(groupOf(room));
export { groupOf as battleGroupOf };
