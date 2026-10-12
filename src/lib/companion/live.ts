import "server-only";

/**
 * Play together: a companion game shared between two phones (server side).
 *
 * The board lives in `companion_live_games` (supabase/companion-live-m1.sql).
 * Phones send moves; each request loads the row, asks a pure plan in
 * `livePlan.ts` what changes (the same reducer the phone uses), and saves it
 * only if nobody saved in between (the `version` check), running the plan
 * again on the newer board when someone did. Coin flips and dice are rolled
 * here, never on a phone.
 *
 * Seats: the host (GS Pro, signed in) is p1; the opponent takes p2 with the
 * code, free, signed in or not. A signed-in player is known by their account;
 * a guest by a token only their phone holds (kept here as a hash).
 */

import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { pokemonMode } from "./modes/pokemon";
import type { SessionAction } from "./state";
import type { ModeConfig, SessionState } from "./types";
import { IDLE_HOURS, SEEN_EVERY_MS, makeCode, otherSeat, type LivePreview, type LiveView, type Seat } from "./liveRules";
import {
  fail,
  planJoin,
  planMove,
  planRoll,
  planUndo,
  viewFor,
  type GameRow,
  type LiveResult,
  type Patch,
  type Plan,
} from "./livePlan";

export type { LivePreview, LiveSeatView, LiveView } from "./liveRules";
export type { LiveError, LiveResult } from "./livePlan";

const MODES: Record<string, ModeConfig> = { pokemon: pokemonMode };
const COLS = "id, code, mode, host_user_id, seats, state, version, past, last_move, pending_rolls, updated_at, ended_at";
const MISSING = new Set(["42P01", "PGRST205", "PGRST202"]);
const RETRIES = 4;

interface Row extends GameRow {
  id: string;
  mode: string;
  host_user_id: string;
  updated_at: string;
}

/** Who's asking: their account (if signed in) and/or the guest token their phone holds. */
export interface Credentials {
  userId: string | null;
  token: string | null;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
const nowIso = () => new Date().toISOString();
const serverCoin = (): "a" | "b" => (randomInt(2) === 0 ? "a" : "b");

let warned = false;
function isMissing(err: { code?: string } | null): boolean {
  if (!err?.code || !MISSING.has(err.code)) return false;
  if (!warned) { console.warn("[companion-live] table missing: run supabase/companion-live-m1.sql"); warned = true; }
  return true;
}

/** True once the table exists (Play together stays hidden until then). */
export async function liveReady(): Promise<boolean> {
  const { error } = await createServiceClient().from("companion_live_games").select("id").limit(1);
  return !isMissing(error);
}

function modeOf(row: Row): ModeConfig {
  return MODES[row.mode] ?? pokemonMode;
}

/** The open game with this code, or why there isn't one. Idle games end here. */
async function loadOpen(code: string): Promise<LiveResult<Row>> {
  const db = createServiceClient();
  const { data, error } = await db.from("companion_live_games").select(COLS).eq("code", code).is("ended_at", null).maybeSingle();
  if (error) return fail(isMissing(error) ? "missing" : "not_found");
  if (!data) {
    // An ended game keeps its row; say so rather than "not found".
    const { data: old } = await db.from("companion_live_games").select("id").eq("code", code).not("ended_at", "is", null).limit(1);
    return fail(old?.length ? "ended" : "not_found");
  }
  const row = data as Row;
  if (Date.now() - Date.parse(row.updated_at) > IDLE_HOURS * 3600_000) {
    await db.from("companion_live_games").update({ ended_at: nowIso() }).eq("id", row.id).is("ended_at", null);
    return fail("ended");
  }
  return { ok: true, value: row };
}

function seatFor(row: GameRow, cred: Credentials): Seat | null {
  for (const seat of ["p1", "p2"] as const) {
    const s = row.seats[seat];
    if (!s) continue;
    if (s.userId && cred.userId && s.userId === cred.userId) return seat;
    if (s.tokenHash && cred.token && hash(cred.token) === s.tokenHash) return seat;
  }
  return null;
}

/** Note that this phone is here (at most every few seconds: it's a write). */
async function touchSeen(row: Row, seat: Seat): Promise<void> {
  const seenAt = row.seats[seat]?.seenAt;
  if (seenAt && Date.now() - Date.parse(seenAt) < SEEN_EVERY_MS) return;
  const db = createServiceClient();
  const { error } = await db.rpc("companion_live_seen", { p_game: row.id, p_seat: seat });
  if (error) {
    // Without the function, write the seat back whole (a lost race only delays "here").
    const seats = { ...row.seats, [seat]: { ...row.seats[seat]!, seenAt: nowIso() } };
    await db.from("companion_live_games").update({ seats }).eq("id", row.id).eq("version", row.version);
  }
}

/** Names a person typed: trimmed, short, and through the word filter. */
export function cleanName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!name || isBlockedText(name)) return null;
  return name;
}

/**
 * Run a plan and save its patch only if nobody saved first; on a clash, load
 * the newer board and plan again. Null from the plan = nothing to save.
 */
async function planAndSave(
  code: string,
  cred: Credentials,
  plan: (row: Row, seat: Seat | null) => Plan,
  options: { mustBeIn?: boolean } = {},
): Promise<LiveResult<{ row: Row; seat: Seat | null }>> {
  const db = createServiceClient();
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const loaded = await loadOpen(code);
    if (!loaded.ok) return loaded;
    const row = loaded.value;
    const seat = seatFor(row, cred);
    if (!seat && options.mustBeIn !== false) return fail("not_in_game");
    const result = plan(row, seat);
    if (!result.ok) return result;
    if (!result.value) return { ok: true, value: { row, seat } };
    const patch: Patch & { updated_at: string } = { ...result.value, updated_at: nowIso() };
    const { data, error } = await db
      .from("companion_live_games")
      .update(patch)
      .eq("id", row.id)
      .eq("version", row.version)
      .is("ended_at", null)
      .select(COLS)
      .maybeSingle();
    if (error) return fail(isMissing(error) ? "missing" : "busy");
    if (data) return { ok: true, value: { row: data as Row, seat } };
  }
  return fail("busy");
}

const viewNow = (row: Row, seat: Seat) => viewFor(row, seat, Date.now());

// ---------------------------------------------------------------------------
// Starting and joining

/**
 * Share the game on the host's phone. The host must be signed in with GS Pro
 * (the route checks Pro). Any other open game of theirs ends: one at a time.
 */
export async function createLiveGame(input: { userId: string; state: SessionState; mode?: string }): Promise<LiveResult<LiveView>> {
  const db = createServiceClient();
  const state = input.state;
  if (!state || !Array.isArray(state.slots) || !state.playerNames || !state.gameSettings) return fail("bad_move");
  const mode = input.mode && MODES[input.mode] ? input.mode : "pokemon";

  await db.from("companion_live_games").update({ ended_at: nowIso() }).eq("host_user_id", input.userId).is("ended_at", null);

  const seats: GameRow["seats"] = {
    p1: { name: state.playerNames.p1, userId: input.userId, tokenHash: null, seenAt: nowIso() },
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode((n) => randomInt(n));
    const { data, error } = await db
      .from("companion_live_games")
      .insert({ code, mode, host_user_id: input.userId, seats, state: { ...state, loadedFromSaveId: null }, version: 1 })
      .select(COLS)
      .single();
    if (!error && data) return { ok: true, value: viewNow(data as Row, "p1") };
    if (error && isMissing(error)) return fail("missing");
    if (error?.code !== "23505") return fail("busy");
  }
  return fail("busy");
}

/** The join page's look at a game: who's hosting and whether there's a seat. */
export async function previewLiveGame(code: string): Promise<LiveResult<LivePreview>> {
  const loaded = await loadOpen(code);
  if (!loaded.ok) return loaded;
  const row = loaded.value;
  return { ok: true, value: { code: row.code, hostName: row.state.playerNames.p1 || "Your opponent", open: !row.seats.p2, ended: false } };
}

/**
 * Take the open seat. A signed-in player needs no token (their account is the
 * key); a guest gets one, which only their phone keeps. Someone already in the
 * game just gets the board back.
 */
export async function joinLiveGame(code: string, cred: Credentials, rawName: unknown): Promise<LiveResult<{ view: LiveView; token: string | null }>> {
  const name = cleanName(rawName);
  const token = cred.userId ? null : newToken();
  const saved = await planAndSave(
    code,
    cred,
    (row, seat) => {
      if (seat) return { ok: true, value: null };
      if (!name) return fail("bad_name");
      return planJoin(row, modeOf(row), { name, userId: cred.userId, tokenHash: token ? hash(token) : null }, nowIso());
    },
    { mustBeIn: false },
  );
  if (!saved.ok) return saved;
  const { row } = saved.value;
  const joinedNow = !saved.value.seat;
  // Already in (account or kept token), or just seated with the new token.
  const seat = saved.value.seat ?? seatFor(row, { userId: cred.userId, token });
  if (!seat) return fail("not_in_game");
  return { ok: true, value: { view: viewNow(row, seat), token: joinedNow ? token : null } };
}

// ---------------------------------------------------------------------------
// Playing

/** The board for a phone in the game; `{ unchanged }` when it has this version already. */
export async function getLiveView(code: string, cred: Credentials, since?: number): Promise<LiveResult<LiveView | { unchanged: true; version: number }>> {
  const loaded = await loadOpen(code);
  if (!loaded.ok) return loaded;
  const row = loaded.value;
  const seat = seatFor(row, cred);
  if (!seat) return fail("not_in_game");
  await touchSeen(row, seat);
  if (since != null && since === row.version) return { ok: true, value: { unchanged: true, version: row.version } };
  return { ok: true, value: viewNow(row, seat) };
}

/** Run one move from a phone on the shared board. */
export async function applyLiveMove(code: string, cred: Credentials, action: SessionAction): Promise<LiveResult<LiveView>> {
  const saved = await planAndSave(code, cred, (row, seat) => planMove(row, seat!, action, modeOf(row), serverCoin, nowIso()));
  if (!saved.ok) return saved;
  return { ok: true, value: viewNow(saved.value.row, saved.value.seat!) };
}

/** Take back your own last move, while nobody has moved since. */
export async function liveUndo(code: string, cred: Credentials): Promise<LiveResult<LiveView>> {
  const saved = await planAndSave(code, cred, (row, seat) => planUndo(row, seat!, nowIso()));
  if (!saved.ok) return saved;
  return { ok: true, value: viewNow(saved.value.row, saved.value.seat!) };
}

/**
 * Roll here, never on a phone. `log`: a plain flip or die roll, logged on the
 * board for both players. `resolve`: a coin the phone is about to use (Burn,
 * Asleep); it's kept so the phone's resolve move can't swap the result.
 */
export async function liveRoll(
  code: string,
  cred: Credentials,
  input: { kind: "coin" | "die"; faces?: number; use: "log" | "resolve" },
): Promise<LiveResult<{ value: number | "a" | "b"; rollId?: string; view: LiveView }>> {
  const kind = input.kind === "die" ? "die" : "coin";
  const use = kind === "coin" && input.use === "resolve" ? "resolve" : "log";
  const faces = kind === "die" ? Math.max(2, Math.min(100, Math.floor(Number(input.faces) || 6))) : 2;
  const value: number | "a" | "b" = kind === "coin" ? serverCoin() : randomInt(faces) + 1;
  const rollId = use === "resolve" ? randomUUID() : undefined;
  const saved = await planAndSave(code, cred, (row, seat) => planRoll(row, seat!, { kind, faces, use, value, rollId }, modeOf(row), nowIso()));
  if (!saved.ok) return saved;
  return { ok: true, value: { value, rollId, view: viewNow(saved.value.row, saved.value.seat!) } };
}

/** The host ends the game for both phones. */
export async function endLiveGame(code: string, cred: Credentials): Promise<LiveResult<true>> {
  const loaded = await loadOpen(code);
  if (!loaded.ok) return loaded.error === "ended" ? { ok: true, value: true } : loaded;
  const row = loaded.value;
  const seat = seatFor(row, cred);
  if (!seat) return fail("not_in_game");
  if (seat !== "p1") return fail("host_only", "Only the host can end the game. Leave it instead.");
  const { error } = await createServiceClient().from("companion_live_games").update({ ended_at: nowIso() }).eq("id", row.id);
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  return { ok: true, value: true };
}

/** A signed-in player's open shared game, if any (to offer "Rejoin"). */
export async function myOpenGame(userId: string): Promise<{ code: string; opponent: string | null } | null> {
  const { data, error } = await createServiceClient()
    .from("companion_live_games")
    .select("code, seats, state, updated_at")
    .is("ended_at", null)
    .or(`seats->p1->>userId.eq.${userId},seats->p2->>userId.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as Pick<Row, "code" | "seats" | "state" | "updated_at">;
  if (Date.now() - Date.parse(row.updated_at) > IDLE_HOURS * 3600_000) return null;
  const mine: Seat = row.seats.p1?.userId === userId ? "p1" : "p2";
  const other = otherSeat(mine);
  return { code: row.code, opponent: row.seats[other] ? row.state.playerNames[other] : null };
}
