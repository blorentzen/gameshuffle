/**
 * Stream Bingo (a GameShuffle Original, GS Pro): number bingo for a streamer's
 * viewers. One open game per community (stream_bingo_games); signed-in viewers
 * take a card on /live (stream_bingo_cards); numbers are called by chat
 * (`!bingo call`), the dashboard, or a timer; a claim is checked here against
 * the numbers actually called, for the game's pattern. Service role only.
 *
 * The timer needs no cron: `tickAuto` runs on the reads the overlay and /live
 * already make every few seconds, and the called-at guard makes a double call
 * impossible when two readers tick at once.
 *
 * Doors (stream-bingo-m2): a game opens with a sign-up window. Cards can only
 * be taken while the doors are open and nothing is called until they close;
 * the first read after that claims the moment (last_called_at null → the
 * closing time) and posts "the doors are closed" to chat once. Custom patterns
 * are a community's own drawings; a game keeps its own copy of the squares.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { cellsHit, cleanCells, makeCard, nextCall, patternCells, patternHit, seriesPattern, PATTERNS, type Pattern } from "@/lib/originals/bingo";
import { announceToCommunity } from "@/lib/twitch/announce";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { awardMint } from "@/lib/economy/awards";

export interface StreamBingoGame {
  id: string;
  communityId: string;
  status: "open" | "won" | "closed";
  pattern: Pattern | "custom";
  /** A custom pattern's squares and name (null for the built-in ones). */
  patternCells: number[] | null;
  patternName: string | null;
  /** When the sign-up window closes (null = no window, cards any time). */
  doorsCloseAt: string | null;
  seriesStep: number | null;
  called: number[];
  lastCalledAt: string | null;
  callInterval: number | null;
  prizeTokens: number;
  prizeText: string | null;
  winnerUserId: string | null;
  winnerName: string | null;
  wonAt: string | null;
  createdAt: string;
  closedAt: string | null;
}

type Row = {
  id: string; community_id: string; status: StreamBingoGame["status"]; pattern: StreamBingoGame["pattern"]; series_step: number | null;
  pattern_cells: number[] | null; pattern_name: string | null; doors_close_at: string | null;
  called: number[] | null; last_called_at: string | null; call_interval: number | null; prize_tokens: number;
  prize_text: string | null; winner_user_id: string | null; winner_name: string | null; won_at: string | null;
  created_at: string; closed_at: string | null;
};

const COLS = "id, community_id, status, pattern, pattern_cells, pattern_name, doors_close_at, series_step, called, last_called_at, call_interval, prize_tokens, prize_text, winner_user_id, winner_name, won_at, created_at, closed_at";
/** How long a finished game stays on /live and the overlay (to show the winner). */
const SHOW_FINISHED_MS = 10 * 60 * 1000;
/** A series continues if the last game was this recent; otherwise it starts over. */
const SERIES_GAP_MS = 12 * 60 * 60 * 1000;
/** The sign-up window when a game doesn't say (seconds). */
export const DEFAULT_DOORS_SECONDS = 120;
/** Saved patterns per community. */
const MAX_PATTERNS = 20;

function toGame(r: Row): StreamBingoGame {
  return {
    id: r.id, communityId: r.community_id, status: r.status, pattern: r.pattern, seriesStep: r.series_step,
    patternCells: r.pattern_cells, patternName: r.pattern_name, doorsCloseAt: r.doors_close_at,
    called: r.called ?? [], lastCalledAt: r.last_called_at, callInterval: r.call_interval, prizeTokens: r.prize_tokens,
    prizeText: r.prize_text, winnerUserId: r.winner_user_id, winnerName: r.winner_name, wonAt: r.won_at,
    createdAt: r.created_at, closedAt: r.closed_at,
  };
}

export function patternLabel(p: Pattern | "custom", name?: string | null): string {
  if (p === "custom") return name || "Your pattern";
  return PATTERNS.find((x) => x.id === p)?.label ?? p;
}

/** The game's pattern, said the way chat and the overlay say it. */
export function gamePatternLabel(g: StreamBingoGame): string {
  return patternLabel(g.pattern, g.patternName);
}

/** The doors are still open: cards can be taken and nothing is called yet. */
export function doorsOpen(g: StreamBingoGame, now = Date.now()): boolean {
  return g.status === "open" && !!g.doorsCloseAt && Date.parse(g.doorsCloseAt) > now;
}

/** "1:24" until the doors close (0:00 once they have). */
export function doorsLeft(g: StreamBingoGame, now = Date.now()): string {
  const ms = g.doorsCloseAt ? Math.max(0, Date.parse(g.doorsCloseAt) - now) : 0;
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export async function getGame(id: string): Promise<StreamBingoGame | null> {
  const { data } = await createServiceClient().from("stream_bingo_games").select(COLS).eq("id", id).maybeSingle();
  return data ? toGame(data as Row) : null;
}

export async function getOpenGame(communityId: string): Promise<StreamBingoGame | null> {
  const { data } = await createServiceClient().from("stream_bingo_games").select(COLS)
    .eq("community_id", communityId).eq("status", "open").maybeSingle();
  return data ? toGame(data as Row) : null;
}

/** The open game, else a game that finished in the last few minutes (so viewers see who won). */
export async function getCurrentGame(communityId: string): Promise<StreamBingoGame | null> {
  const { data } = await createServiceClient().from("stream_bingo_games").select(COLS)
    .eq("community_id", communityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const g = toGame(data as Row);
  if (g.status === "open") return g;
  const ended = Date.parse(g.wonAt ?? g.closedAt ?? g.createdAt);
  return Date.now() - ended < SHOW_FINISHED_MS ? g : null;
}

export interface OpenGameInput {
  communityId: string;
  createdBy: string | null;
  /** A pattern, "series" for the next pattern in the series, or "custom:<id>" for a saved one. */
  pattern: Pattern | "series" | `custom:${string}`;
  /** Sign-up window in seconds (undefined = the 2-minute default, 0 or null = none). */
  doorsSeconds?: number | null;
  callInterval?: number | null;
  prizeTokens?: number;
  prizeText?: string | null;
  sessionId?: string | null;
}

export type BingoResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function openGame(input: OpenGameInput): Promise<BingoResult<StreamBingoGame>> {
  const admin = createServiceClient();
  if (await getOpenGame(input.communityId)) return { ok: false, error: "already_open" };

  let pattern: Pattern | "custom";
  let seriesStep: number | null = null;
  let cells: number[] | null = null;
  let patternName: string | null = null;
  if (input.pattern.startsWith("custom:")) {
    const saved = await getPattern(input.communityId, input.pattern.slice(7));
    if (!saved) return { ok: false, error: "bad_pattern" };
    pattern = "custom";
    cells = saved.cells;
    patternName = saved.name;
  } else if (input.pattern === "series") {
    const { data: last } = await admin.from("stream_bingo_games").select("series_step, created_at")
      .eq("community_id", input.communityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const prev = last as { series_step: number | null; created_at: string } | null;
    const continues = prev?.series_step && Date.now() - Date.parse(prev.created_at) < SERIES_GAP_MS && prev.series_step < 50;
    seriesStep = continues ? prev!.series_step! + 1 : 1;
    pattern = seriesPattern(seriesStep);
  } else if (PATTERNS.some((p) => p.id === input.pattern)) {
    pattern = input.pattern as Pattern;
  } else {
    return { ok: false, error: "bad_pattern" };
  }

  const interval = input.callInterval ? Math.round(input.callInterval) : null;
  if (interval !== null && (interval < 30 || interval > 600)) return { ok: false, error: "bad_interval" };
  const prizeTokens = Math.max(0, Math.min(100000, Math.round(input.prizeTokens ?? 0)));
  const prizeText = input.prizeText?.trim().slice(0, 140) || null;
  const doors = input.doorsSeconds === undefined ? DEFAULT_DOORS_SECONDS : Math.round(input.doorsSeconds ?? 0);
  if (doors !== 0 && (doors < 30 || doors > 600)) return { ok: false, error: "bad_doors" };

  const { data, error } = await admin.from("stream_bingo_games").insert({
    community_id: input.communityId, session_id: input.sessionId ?? null, pattern, series_step: seriesStep,
    pattern_cells: cells, pattern_name: patternName,
    doors_close_at: doors ? new Date(Date.now() + doors * 1000).toISOString() : null,
    call_interval: interval, prize_tokens: prizeTokens, prize_text: prizeText, created_by: input.createdBy,
  }).select(COLS).single();
  if (error) return { ok: false, error: error.code === "23505" ? "already_open" : "insert_failed" };
  return { ok: true, value: toGame(data as Row) };
}

/**
 * Calls the next number. Guarded on the last call's timestamp, so two callers
 * racing (a mod and the timer) produce one call, not two. Returns the game after
 * the call, or null if nothing was called (not open, all 75 out, or lost a race).
 */
export async function callNext(game: StreamBingoGame): Promise<StreamBingoGame | null> {
  if (game.status !== "open" || doorsOpen(game)) return null;
  const n = nextCall(game.called);
  if (n === null) return null;
  let q = createServiceClient().from("stream_bingo_games")
    .update({ called: [...game.called, n], last_called_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", "open");
  q = game.lastCalledAt ? q.eq("last_called_at", game.lastCalledAt) : q.is("last_called_at", null);
  const { data } = await q.select(COLS).maybeSingle();
  return data ? toGame(data as Row) : null;
}

/**
 * Moves the game along on a read: once the doors close, claims that moment and
 * tells chat (once), then makes the timer's call if one is due. Returns the
 * up-to-date game.
 */
export async function tickAuto(game: StreamBingoGame): Promise<StreamBingoGame> {
  if (game.status !== "open" || doorsOpen(game)) return game;
  if (game.doorsCloseAt && !game.lastCalledAt) {
    const { data } = await createServiceClient().from("stream_bingo_games")
      .update({ last_called_at: game.doorsCloseAt })
      .eq("id", game.id).eq("status", "open").is("last_called_at", null).select(COLS).maybeSingle();
    if (data) {
      game = toGame(data as Row);
      const players = await cardCount(game.id);
      await announceToCommunity(game.communityId, `🔢 The doors are closed: ${players} ${players === 1 ? "card" : "cards"} in play. ${game.callInterval ? `First number in ${game.callInterval} seconds.` : "Calling starts now."} First real ${gamePatternLabel(game)} wins.`);
    } else {
      game = (await getGame(game.id)) ?? game;
    }
  }
  if (!game.callInterval) return game;
  const since = Date.parse(game.lastCalledAt ?? game.createdAt);
  if (Date.now() - since < game.callInterval * 1000) return game;
  return (await callNext(game)) ?? (await getGame(game.id)) ?? game;
}

export async function setAutoCall(gameId: string, seconds: number | null): Promise<BingoResult<StreamBingoGame>> {
  const s = seconds ? Math.round(seconds) : null;
  if (s !== null && (s < 30 || s > 600)) return { ok: false, error: "bad_interval" };
  const game = await getGame(gameId);
  if (!game) return { ok: false, error: "not_open" };
  // Restart the clock from now so switching the timer on doesn't fire at once
  // (left alone before the doors close: their closing starts the clock).
  const restart = s && !(game.doorsCloseAt && !game.lastCalledAt);
  const { data } = await createServiceClient().from("stream_bingo_games")
    .update({ call_interval: s, ...(restart ? { last_called_at: new Date().toISOString() } : {}) })
    .eq("id", gameId).eq("status", "open").select(COLS).maybeSingle();
  return data ? { ok: true, value: toGame(data as Row) } : { ok: false, error: "not_open" };
}

/** Closes the doors now (the streamer's "everyone's in"). */
export async function closeDoors(gameId: string): Promise<BingoResult<StreamBingoGame>> {
  const now = new Date().toISOString();
  const { data } = await createServiceClient().from("stream_bingo_games")
    .update({ doors_close_at: now })
    .eq("id", gameId).eq("status", "open").gt("doors_close_at", now).select(COLS).maybeSingle();
  if (!data) return { ok: false, error: "doors_closed" };
  return { ok: true, value: await tickAuto(toGame(data as Row)) };
}

export async function closeGame(gameId: string): Promise<BingoResult<StreamBingoGame>> {
  const { data } = await createServiceClient().from("stream_bingo_games")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", gameId).eq("status", "open").select(COLS).maybeSingle();
  return data ? { ok: true, value: toGame(data as Row) } : { ok: false, error: "not_open" };
}

/**
 * Who holds a card: a GameShuffle account (/live), or a chat identity (a Twitch
 * viewer playing from the extension without an account; stream-bingo-m3.sql).
 * A plain string is an account id, as before.
 */
export type BingoHolder = string | { userId: string } | { identityId: string };
const holderCol = (h: BingoHolder): { col: "user_id" | "identity_id"; id: string } =>
  typeof h === "string" ? { col: "user_id", id: h } : "userId" in h ? { col: "user_id", id: h.userId } : { col: "identity_id", id: h.identityId };

export async function getCard(gameId: string, holder: BingoHolder): Promise<number[] | null> {
  const { col, id } = holderCol(holder);
  const { data } = await createServiceClient().from("stream_bingo_cards").select("numbers")
    .eq("game_id", gameId).eq(col, id).maybeSingle();
  return (data as { numbers: number[] } | null)?.numbers ?? null;
}

export async function cardCount(gameId: string): Promise<number> {
  const { count } = await createServiceClient().from("stream_bingo_cards")
    .select("id", { count: "exact", head: true }).eq("game_id", gameId);
  return count ?? 0;
}

/** The viewer's card for this game, dealing one if they don't have it yet. */
export async function takeCard(game: StreamBingoGame, holder: BingoHolder): Promise<BingoResult<number[]>> {
  if (game.status !== "open") return { ok: false, error: "not_open" };
  const have = await getCard(game.id, holder);
  if (have) return { ok: true, value: have };
  if (game.doorsCloseAt && !doorsOpen(game)) return { ok: false, error: "doors_closed" };
  const numbers = makeCard();
  const { col, id } = holderCol(holder);
  const { error } = await createServiceClient().from("stream_bingo_cards").insert({ game_id: game.id, [col]: id, numbers });
  if (error) {
    // Two tabs dealing at once: the other insert won, use its card.
    const again = await getCard(game.id, holder);
    return again ? { ok: true, value: again } : { ok: false, error: "card_failed" };
  }
  return { ok: true, value: numbers };
}

export type ClaimOutcome =
  | { ok: true; game: StreamBingoGame; tokens: number; tokenError: string | null }
  | { ok: false; error: "not_open" | "no_card" | "not_yet" | "too_late" };

/**
 * A viewer's Bingo! claim. Checked against the called numbers for the game's
 * pattern; the first valid claim wins (the status flip is the lock). Tokens are
 * minted from the streamer's award allowance; if that fails the win still
 * stands and the reason comes back for the announcement.
 */
export async function claimBingo(game: StreamBingoGame, holder: BingoHolder, name: string): Promise<ClaimOutcome> {
  if (game.status !== "open") return { ok: false, error: game.status === "won" ? "too_late" : "not_open" };
  const card = await getCard(game.id, holder);
  const { col, id: holderId } = holderCol(holder);
  if (!card) return { ok: false, error: "no_card" };
  const hit = game.pattern === "custom" ? cellsHit(card, game.called, game.patternCells ?? []) : patternHit(card, game.called, game.pattern);
  if (!hit) return { ok: false, error: "not_yet" };

  const { data } = await createServiceClient().from("stream_bingo_games")
    .update({ status: "won", ...(col === "user_id" ? { winner_user_id: holderId } : { winner_identity_id: holderId }), winner_name: name.slice(0, 40), won_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", "open").select(COLS).maybeSingle();
  if (!data) return { ok: false, error: "too_late" };
  const won = toGame(data as Row);

  let tokens = 0;
  let tokenError: string | null = null;
  if (won.prizeTokens > 0) {
    try {
      // An identity is its own wallet; an account gets (or reuses) its own.
      const wallet = col === "identity_id" ? { identityId: holderId } : await ensureAccountWallet(holderId, name);
      if (!wallet) throw new Error("no_wallet");
      const minted = await awardMint({
        communityId: won.communityId, toIdentityId: wallet.identityId, amount: won.prizeTokens,
        refId: won.id, meta: { source: "stream_bingo" },
      });
      if (minted.ok) tokens = minted.minted;
      else tokenError = minted.reason;
    } catch (err) {
      console.error("[stream-bingo] prize mint failed:", err);
      tokenError = "mint_failed";
    }
  }
  return { ok: true, game: won, tokens, tokenError };
}

export function winnerMessage(game: StreamBingoGame, tokens: number, tokenError: string | null): string {
  const prizes = [tokens > 0 ? `${tokens} tokens` : null, game.prizeText].filter(Boolean).join(" + ");
  const shortfall = game.prizeTokens > 0 && tokenError ? " (the token prize couldn't be paid: the monthly award allowance is used up)" : "";
  return `🎉 BINGO! ${game.winnerName ?? "Someone"} wins with ${gamePatternLabel(game)} after ${game.called.length} calls${prizes ? `. Prize: ${prizes}` : ""}${shortfall}.`;
}

/** Chat announcements moved to a shared helper (drafts use it too). */
export { announceToCommunity } from "@/lib/twitch/announce";

/** What viewers and the overlay see (no one else's card). */
export interface StreamBingoView {
  id: string;
  status: StreamBingoGame["status"];
  pattern: StreamBingoGame["pattern"];
  patternLabel: string;
  /** The squares to complete, for drawing the shape (null for "Any line"). */
  shape: number[] | null;
  /** Sign-up window end; cards can be taken until then (null = any time). */
  doorsCloseAt: string | null;
  seriesStep: number | null;
  called: number[];
  last: number | null;
  callInterval: number | null;
  nextCallAt: string | null;
  prizeTokens: number;
  prizeText: string | null;
  winnerName: string | null;
  players: number;
}

export async function viewOf(game: StreamBingoGame): Promise<StreamBingoView> {
  const nextCallAt = game.status === "open" && game.callInterval && !doorsOpen(game)
    ? new Date(Date.parse(game.lastCalledAt ?? game.doorsCloseAt ?? game.createdAt) + game.callInterval * 1000).toISOString()
    : null;
  return {
    id: game.id, status: game.status, pattern: game.pattern, patternLabel: gamePatternLabel(game),
    shape: game.pattern === "custom" ? game.patternCells : patternCells(game.pattern), doorsCloseAt: game.doorsCloseAt,
    seriesStep: game.seriesStep, called: game.called, last: game.called[game.called.length - 1] ?? null,
    callInterval: game.callInterval, nextCallAt, prizeTokens: game.prizeTokens, prizeText: game.prizeText,
    winnerName: game.winnerName, players: await cardCount(game.id),
  };
}

// ---------------------------------------------------------------------------
// Saved patterns (a community's own drawings)
// ---------------------------------------------------------------------------

export interface SavedPattern { id: string; name: string; cells: number[] }

export async function listPatterns(communityId: string): Promise<SavedPattern[]> {
  const { data } = await createServiceClient().from("stream_bingo_patterns").select("id, name, cells")
    .eq("community_id", communityId).order("created_at", { ascending: true });
  return (data as SavedPattern[] | null) ?? [];
}

export async function getPattern(communityId: string, id: string): Promise<SavedPattern | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("stream_bingo_patterns").select("id, name, cells")
    .eq("community_id", communityId).eq("id", id).maybeSingle();
  return (data as SavedPattern | null) ?? null;
}

export async function savePattern(communityId: string, userId: string, name: string, rawCells: unknown): Promise<BingoResult<SavedPattern>> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return { ok: false, error: "no_name" };
  const cells = cleanCells(rawCells);
  if (!cells) return { ok: false, error: "too_few" };
  const admin = createServiceClient();
  const { count } = await admin.from("stream_bingo_patterns").select("id", { count: "exact", head: true }).eq("community_id", communityId);
  if ((count ?? 0) >= MAX_PATTERNS) return { ok: false, error: "too_many" };
  // Names are unique per community whatever the case ("Big L" and "big l" would read the same in chat).
  const { data: same } = await admin.from("stream_bingo_patterns").select("id").eq("community_id", communityId).ilike("name", clean.replace(/[\\%_]/g, "\\$&")).limit(1);
  if (same?.length) return { ok: false, error: "name_taken" };
  const { data, error } = await admin.from("stream_bingo_patterns")
    .insert({ community_id: communityId, name: clean, cells, created_by: userId }).select("id, name, cells").single();
  if (error) return { ok: false, error: error.code === "23505" ? "name_taken" : "save_failed" };
  return { ok: true, value: data as SavedPattern };
}

export async function deletePattern(communityId: string, id: string): Promise<boolean> {
  const { error, count } = await createServiceClient().from("stream_bingo_patterns")
    .delete({ count: "exact" }).eq("community_id", communityId).eq("id", id);
  return !error && (count ?? 0) > 0;
}
