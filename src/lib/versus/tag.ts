import "server-only";

/**
 * Tag team against a trainer on the head-to-head rooms (server; co-op picks 2026-11-11, pick 4): two players share one
 * side of this month's Trainer Road duel for a team. The room starts like a duel room (kind "tag", `settings.duel` for
 * the team and month, always Normal); at Go the duel lives in `versus_battles` (the same table as trainer battles:
 * players by seat, the duel's setup, every step, the tag state, the clock), on the tag rules (src/lib/originals/duel/
 * tag.ts) over the duel engine. Both players poll; every read checks the clock. The room's two lanes move together:
 * the trainer's cards knocked out, the turn, then both done (a win, in turns) or both out (a loss). Par and stars show
 * as for any duel of that team; a tag duel doesn't go on either player's Trainer Road best or the board.
 */

import { getRoadDuel } from "@/lib/originals/duel/roadStore";
import { trainerView } from "@/lib/originals/duel/store";
import { levelSetup } from "@/lib/originals/duel/solver";
import { roadStars } from "@/lib/originals/duel/road";
import { viewOf, type DuelSetup } from "@/lib/originals/duel/engine";
import { coinFor } from "@/lib/originals/duel/battle";
import {
  applyTag, choicesFor, draftSize, phaseOf, startTag, tagResult, tagTimeOut, waitingOn,
  type TagSide, type TagState, type TagStep,
} from "@/lib/originals/duel/tag";
import type { DuelPlayView } from "@/lib/originals/duel/view";
import { createServiceClient } from "@/lib/supabase/admin";
import { roomLane } from "./relay";
import { battleReady } from "./battle";
import { cleanVersusSettings } from "./rules";
import type { TagInfo, TagRunView } from "./types";

const db = () => createServiceClient();
const TURN_MS = 60_000;
const GONE_MS = 120_000;
const SEEN_EVERY_MS = 15_000;

interface TagPlayer { side: TagSide; seen: number }
interface Step { by: TagSide | "clock" | "left"; st?: TagStep; at: number }
interface TagRow {
  room_id: string;
  phase: "bring" | "play" | "done";
  players: Record<string, TagPlayer>;
  setup: DuelSetup | null;
  steps: Step[];
  state: (TagState & { kos?: number[]; left?: TagSide | null }) | null;
  deadline: string | null;
  version: number;
  created_at: string;
}
const COLS = "room_id, phase, players, setup, steps, state, deadline, version, created_at";
interface RoomBits { id: string; room_key: string; code: string; settings: unknown }

async function load(roomId: string): Promise<TagRow | null> {
  const { data } = await db().from("versus_battles").select(COLS).eq("room_id", roomId).maybeSingle();
  return (data as TagRow | null) ?? null;
}
async function save(row: TagRow, patch: Partial<TagRow>): Promise<TagRow | null> {
  const { data } = await db().from("versus_battles").update({ ...patch, version: row.version + 1, updated_at: new Date().toISOString() })
    .eq("room_id", row.room_id).eq("version", row.version).select(COLS).maybeSingle();
  return (data as TagRow | null) ?? null;
}

const duelOf = (room: RoomBits) => cleanVersusSettings(room.settings).duel ?? null;

/** The duel the room plays (Normal, no tools). */
async function setupFor(room: RoomBits): Promise<{ setup: DuelSetup; par: number; trainer: Awaited<ReturnType<typeof getRoadDuel>> } | null> {
  const d = duelOf(room);
  if (!d) return null;
  const duel = await getRoadDuel(d.trainerId, d.month);
  if (!duel) return null;
  return { setup: { ...levelSetup(duel.setup, "normal"), tools: 0 }, par: duel.par, trainer: duel };
}

/** At the room's Go: the two players by seat, the coin for the first draft pick, the clock. */
export async function startTagRoom(room: RoomBits): Promise<void> {
  if (!(await battleReady())) return;
  const got = await setupFor(room);
  if (!got) { console.error(`[tag] no duel for ${room.code}`); return; }
  const { data } = await db().from("versus_entrants").select("user_id, seat").eq("room_id", room.id).in("status", ["racing", "done", "out"]).order("seat");
  const rows = ((data ?? []) as { user_id: string; seat: number }[]).slice(0, 2);
  if (rows.length < 2) return;
  const now = Date.now();
  const players: Record<string, TagPlayer> = {};
  rows.forEach((r, i) => { players[r.user_id] = { side: i as TagSide, seen: now }; });
  const state = { ...startTag(got.setup, coinFor(room.room_key)), kos: [] as number[], left: null };
  const { error } = await db().from("versus_battles").insert({ room_id: room.id, phase: "play", players, setup: got.setup, state, deadline: new Date(now + TURN_MS).toISOString() });
  if (error && error.code !== "23505") console.error("[tag] start:", error.message);
}

/** The trainer's cards out after a step, written down by turn (the lanes' progress). */
function withKos(before: TagState & { kos?: number[] }, after: TagState): number[] {
  const kos = [...(before.kos ?? [])];
  const was = before.duel.foe.filter((c) => c.out).length;
  const now = after.duel.foe.filter((c) => c.out).length;
  for (let k = was; k < now; k++) kos.push(after.duel.turn);
  return kos;
}

const resultOf = (s: TagRow["state"]) => (s ? (s.left != null ? "lost" : tagResult(s)) : null);

async function lanes(room: RoomBits, row: TagRow) {
  const s = row.state;
  if (!s || !row.setup) return;
  const res = resultOf(s);
  const elapsed = Date.now() - Date.parse(row.created_at);
  const kos = s.kos ?? [];
  const lane: Record<string, unknown> = { reached: kos.length, times: row.setup.foe.map((_, k) => kos[k] ?? null), current: Math.max(1, s.duel.turn) };
  if (res === "won") Object.assign(lane, { status: "done", finalMs: Math.max(1, s.duel.turn), tieMs: elapsed });
  else if (res === "lost") Object.assign(lane, { status: "out", reason: s.left != null ? "left" : "lost", tieMs: elapsed });
  await Promise.all(Object.keys(row.players).map(async (id) => {
    const r = await roomLane(room.room_key, id, lane);
    if (!r.ok) console.warn(`[tag] lane for ${room.code}: ${r.error}`);
  }));
}

/** The clock and who's still here, on every read: a pick or turn that ran out plays itself; a player gone 2 minutes loses it for both. */
async function tick(room: RoomBits, row: TagRow, viewerId: string | null): Promise<TagRow> {
  let cur = row;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cur.phase === "done" || !cur.setup || !cur.state) return cur;
    const now = Date.now();
    const players = { ...cur.players };
    let touched = false;
    if (viewerId && players[viewerId] && now - players[viewerId].seen > SEEN_EVERY_MS) { players[viewerId] = { ...players[viewerId], seen: now }; touched = true; }
    const late = cur.deadline != null && Date.parse(cur.deadline) <= now;
    const gone = Object.keys(players).find((id) => now - players[id].seen > GONE_MS);
    if (!late && !gone) {
      if (!touched) return cur;
      const saved = await save(cur, { players });
      if (saved) return saved;
      cur = (await load(room.id)) ?? cur;
      continue;
    }
    let state: TagRow["state"];
    const steps = [...cur.steps];
    if (gone) {
      state = { ...cur.state, left: players[gone].side };
      steps.push({ by: "left", at: now });
    } else {
      const next = tagTimeOut(cur.setup, cur.state);
      state = { ...next, kos: withKos(cur.state, next), left: null };
      steps.push({ by: "clock", at: now });
    }
    const done = resultOf(state) != null;
    const saved = await save(cur, { players, state, steps, phase: done ? "done" : "play", deadline: done ? null : new Date(now + TURN_MS).toISOString() });
    if (saved) { await lanes(room, saved); return saved; }
    cur = (await load(room.id)) ?? cur;
  }
  return cur;
}

export type TagStepResult = { ok: true; run: TagRunView } | { ok: false; error: "not_found" | "not_in" | "not_now" | "illegal" | "busy" };

export async function tagStep(room: RoomBits, userId: string, body: TagStep): Promise<TagStepResult> {
  let row = await load(room.id);
  if (!row || !row.setup || !row.state) return { ok: false, error: "not_found" };
  row = await tick(room, row, userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = row.players[userId];
    if (!p) return { ok: false, error: "not_in" };
    if (row.phase === "done" || !row.setup || !row.state) return { ok: false, error: "not_now" };
    const next = applyTag(row.setup, row.state, p.side, body);
    if (!next) return { ok: false, error: "illegal" };
    const state = { ...next, kos: withKos(row.state, next), left: null };
    const done = resultOf(state) != null;
    const saved = await save(row, {
      players: { ...row.players, [userId]: { ...p, seen: Date.now() } }, state,
      steps: [...row.steps, { by: p.side, st: body, at: Date.now() }],
      phase: done ? "done" : "play", deadline: done ? null : new Date(Date.now() + TURN_MS).toISOString(),
    });
    if (saved) { await lanes(room, saved); return { ok: true, run: await runView(room, saved, userId) }; }
    row = (await load(room.id)) ?? row;
  }
  return { ok: false, error: "busy" };
}

/** A player leaves a running tag duel: it's lost for both. */
export async function leaveTag(room: RoomBits, userId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await load(room.id);
    if (!row || !row.players[userId] || row.phase === "done" || !row.state) return false;
    const saved = await save(row, { state: { ...row.state, left: row.players[userId].side }, steps: [...row.steps, { by: "left", at: Date.now() }], phase: "done", deadline: null });
    if (saved) { await lanes(room, saved); return true; }
  }
  return false;
}

export async function tagRunView(room: RoomBits, viewerId: string | null): Promise<TagRunView | null> {
  const row0 = await load(room.id);
  if (!row0) return null;
  return runView(room, await tick(room, row0, viewerId), viewerId);
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await db().from("users").select("id, display_name, username").in("id", ids);
  for (const u of (data ?? []) as { id: string; display_name: string | null; username: string | null }[]) out.set(u.id, (u.display_name || u.username || "Player").slice(0, 40));
  return out;
}

async function runView(room: RoomBits, row: TagRow, viewerId: string | null): Promise<TagRunView> {
  const got = await setupFor(room);
  const setup = row.setup!;
  const s = row.state!;
  const ids = Object.keys(row.players).sort((a, b) => row.players[a].side - row.players[b].side);
  const names = await namesOf(ids);
  const me: TagSide | null = viewerId && row.players[viewerId] ? row.players[viewerId].side : null;
  const nameOf = (side: TagSide) => names.get(ids[side]) ?? "Player";
  const partner: TagSide = me === 1 ? 0 : 1;
  const duel = got!.trainer!;
  const t = trainerView(duel.trainer, setup.foe[setup.foe.length - 1] ?? null);
  const play: DuelPlayView = viewOf(setup, s.duel, duel.trainer);
  const ph = phaseOf(setup, s);
  const wait = waitingOn(setup, s);
  const mine = me != null && wait === me;
  const res = resultOf(s);
  // Only the player the duel waits on gets controls; a lead or send-out offers their own choices.
  if (!mine || ph === "draft" || res) {
    play.attachTo = [];
    play.swaps = [];
    play.canMove = false;
    play.needsNext = false;
    play.nexts = [];
    play.energy = { ...play.energy, now: null };
  } else if (ph === "lead" || s.duel.you[s.duel.yi]?.out) {
    play.needsNext = true;
    play.nexts = choicesFor(setup, s, me!);
  }
  play.needsBring = false;
  const whose = (i: number): "you" | "partner" | null => (s.owner[i] == null ? null : s.owner[i] === me ? "you" : "partner");
  const turns = s.duel.turn;
  const info: TagInfo = {
    phase: res ? "done" : ph,
    deadline: row.deadline ? Date.parse(row.deadline) : null,
    waiting: wait == null || res ? null : me == null ? "partner" : wait === me ? "you" : "partner",
    partner: me == null ? `${nameOf(0)} and ${nameOf(1)}` : nameOf(partner),
    names: [nameOf(0), nameOf(1)],
    owners: setup.you.map((_, i) => whose(i)),
    draft: { size: draftSize(setup), choices: me != null && ph === "draft" ? choicesFor(setup, s, me) : [] },
    first: { name: nameOf(s.first), you: me === s.first },
    result: res,
    why: s.left != null ? "left" : s.timedOut != null ? "timeout" : res ? "knockout" : null,
    par: got!.par,
    stars: res === "won" ? roadStars(true, turns, got!.par, "normal") : res === "lost" ? 0 : null,
    spectator: me == null,
    missed: me == null ? 0 : s.missed[me],
    version: row.version,
    code: room.code,
  };
  return {
    id: room.code, day: "", number: 0, official: true,
    status: res ? "done" : "playing",
    trainer: t,
    play,
    result: res,
    turns,
    cardsLeft: s.duel.you.filter((c, i) => !c.out && (!s.duel.brought || s.duel.brought.includes(i))).length,
    par: got!.par, points: null, seconds: null,
    startedAt: row.created_at, serverNow: new Date().toISOString(),
    board: null, score: null, scoring: "points", asked: false, level: "normal", share: null, bag: null,
    tag: info,
  };
}
