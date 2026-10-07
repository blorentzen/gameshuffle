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
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { makeCard, nextCall, patternHit, seriesPattern, PATTERNS, type Pattern } from "@/lib/originals/bingo";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { awardMint } from "@/lib/economy/awards";

export interface StreamBingoGame {
  id: string;
  communityId: string;
  status: "open" | "won" | "closed";
  pattern: Pattern;
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
  id: string; community_id: string; status: StreamBingoGame["status"]; pattern: Pattern; series_step: number | null;
  called: number[] | null; last_called_at: string | null; call_interval: number | null; prize_tokens: number;
  prize_text: string | null; winner_user_id: string | null; winner_name: string | null; won_at: string | null;
  created_at: string; closed_at: string | null;
};

const COLS = "id, community_id, status, pattern, series_step, called, last_called_at, call_interval, prize_tokens, prize_text, winner_user_id, winner_name, won_at, created_at, closed_at";
/** How long a finished game stays on /live and the overlay (to show the winner). */
const SHOW_FINISHED_MS = 10 * 60 * 1000;
/** A series continues if the last game was this recent; otherwise it starts over. */
const SERIES_GAP_MS = 12 * 60 * 60 * 1000;

function toGame(r: Row): StreamBingoGame {
  return {
    id: r.id, communityId: r.community_id, status: r.status, pattern: r.pattern, seriesStep: r.series_step,
    called: r.called ?? [], lastCalledAt: r.last_called_at, callInterval: r.call_interval, prizeTokens: r.prize_tokens,
    prizeText: r.prize_text, winnerUserId: r.winner_user_id, winnerName: r.winner_name, wonAt: r.won_at,
    createdAt: r.created_at, closedAt: r.closed_at,
  };
}

export function patternLabel(p: Pattern): string {
  return PATTERNS.find((x) => x.id === p)?.label ?? p;
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
  /** A pattern, or "series" to take the next pattern in the series. */
  pattern: Pattern | "series";
  callInterval?: number | null;
  prizeTokens?: number;
  prizeText?: string | null;
  sessionId?: string | null;
}

export type BingoResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function openGame(input: OpenGameInput): Promise<BingoResult<StreamBingoGame>> {
  const admin = createServiceClient();
  if (await getOpenGame(input.communityId)) return { ok: false, error: "already_open" };

  let pattern: Pattern;
  let seriesStep: number | null = null;
  if (input.pattern === "series") {
    const { data: last } = await admin.from("stream_bingo_games").select("series_step, created_at")
      .eq("community_id", input.communityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const prev = last as { series_step: number | null; created_at: string } | null;
    const continues = prev?.series_step && Date.now() - Date.parse(prev.created_at) < SERIES_GAP_MS && prev.series_step < 50;
    seriesStep = continues ? prev!.series_step! + 1 : 1;
    pattern = seriesPattern(seriesStep);
  } else if (PATTERNS.some((p) => p.id === input.pattern)) {
    pattern = input.pattern;
  } else {
    return { ok: false, error: "bad_pattern" };
  }

  const interval = input.callInterval ? Math.round(input.callInterval) : null;
  if (interval !== null && (interval < 30 || interval > 600)) return { ok: false, error: "bad_interval" };
  const prizeTokens = Math.max(0, Math.min(100000, Math.round(input.prizeTokens ?? 0)));
  const prizeText = input.prizeText?.trim().slice(0, 140) || null;

  const { data, error } = await admin.from("stream_bingo_games").insert({
    community_id: input.communityId, session_id: input.sessionId ?? null, pattern, series_step: seriesStep,
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
  if (game.status !== "open") return null;
  const n = nextCall(game.called);
  if (n === null) return null;
  let q = createServiceClient().from("stream_bingo_games")
    .update({ called: [...game.called, n], last_called_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", "open");
  q = game.lastCalledAt ? q.eq("last_called_at", game.lastCalledAt) : q.is("last_called_at", null);
  const { data } = await q.select(COLS).maybeSingle();
  return data ? toGame(data as Row) : null;
}

/** Makes the timer's call if one is due. Returns the up-to-date game. */
export async function tickAuto(game: StreamBingoGame): Promise<StreamBingoGame> {
  if (game.status !== "open" || !game.callInterval) return game;
  const since = Date.parse(game.lastCalledAt ?? game.createdAt);
  if (Date.now() - since < game.callInterval * 1000) return game;
  return (await callNext(game)) ?? (await getGame(game.id)) ?? game;
}

export async function setAutoCall(gameId: string, seconds: number | null): Promise<BingoResult<StreamBingoGame>> {
  const s = seconds ? Math.round(seconds) : null;
  if (s !== null && (s < 30 || s > 600)) return { ok: false, error: "bad_interval" };
  const { data } = await createServiceClient().from("stream_bingo_games")
    // Restart the clock from now so switching the timer on doesn't fire at once.
    .update({ call_interval: s, ...(s ? { last_called_at: new Date().toISOString() } : {}) })
    .eq("id", gameId).eq("status", "open").select(COLS).maybeSingle();
  return data ? { ok: true, value: toGame(data as Row) } : { ok: false, error: "not_open" };
}

export async function closeGame(gameId: string): Promise<BingoResult<StreamBingoGame>> {
  const { data } = await createServiceClient().from("stream_bingo_games")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", gameId).eq("status", "open").select(COLS).maybeSingle();
  return data ? { ok: true, value: toGame(data as Row) } : { ok: false, error: "not_open" };
}

export async function getCard(gameId: string, userId: string): Promise<number[] | null> {
  const { data } = await createServiceClient().from("stream_bingo_cards").select("numbers")
    .eq("game_id", gameId).eq("user_id", userId).maybeSingle();
  return (data as { numbers: number[] } | null)?.numbers ?? null;
}

export async function cardCount(gameId: string): Promise<number> {
  const { count } = await createServiceClient().from("stream_bingo_cards")
    .select("id", { count: "exact", head: true }).eq("game_id", gameId);
  return count ?? 0;
}

/** The viewer's card for this game, dealing one if they don't have it yet. */
export async function takeCard(game: StreamBingoGame, userId: string): Promise<BingoResult<number[]>> {
  if (game.status !== "open") return { ok: false, error: "not_open" };
  const have = await getCard(game.id, userId);
  if (have) return { ok: true, value: have };
  const numbers = makeCard();
  const { error } = await createServiceClient().from("stream_bingo_cards").insert({ game_id: game.id, user_id: userId, numbers });
  if (error) {
    // Two tabs dealing at once: the other insert won, use its card.
    const again = await getCard(game.id, userId);
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
export async function claimBingo(game: StreamBingoGame, userId: string, name: string): Promise<ClaimOutcome> {
  if (game.status !== "open") return { ok: false, error: game.status === "won" ? "too_late" : "not_open" };
  const card = await getCard(game.id, userId);
  if (!card) return { ok: false, error: "no_card" };
  if (!patternHit(card, game.called, game.pattern)) return { ok: false, error: "not_yet" };

  const { data } = await createServiceClient().from("stream_bingo_games")
    .update({ status: "won", winner_user_id: userId, winner_name: name.slice(0, 40), won_at: new Date().toISOString() })
    .eq("id", game.id).eq("status", "open").select(COLS).maybeSingle();
  if (!data) return { ok: false, error: "too_late" };
  const won = toGame(data as Row);

  let tokens = 0;
  let tokenError: string | null = null;
  if (won.prizeTokens > 0) {
    try {
      const wallet = await ensureAccountWallet(userId, name);
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
  return `🎉 BINGO! ${game.winnerName ?? "Someone"} wins with ${patternLabel(game.pattern)} after ${game.called.length} calls${prizes ? `. Prize: ${prizes}` : ""}${shortfall}.`;
}

/** Chat announcements moved to a shared helper (drafts use it too). */
export { announceToCommunity } from "@/lib/twitch/announce";

/** What viewers and the overlay see (no one else's card). */
export interface StreamBingoView {
  id: string;
  status: StreamBingoGame["status"];
  pattern: Pattern;
  patternLabel: string;
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
  const nextCallAt = game.status === "open" && game.callInterval
    ? new Date(Date.parse(game.lastCalledAt ?? game.createdAt) + game.callInterval * 1000).toISOString()
    : null;
  return {
    id: game.id, status: game.status, pattern: game.pattern, patternLabel: patternLabel(game.pattern),
    seriesStep: game.seriesStep, called: game.called, last: game.called[game.called.length - 1] ?? null,
    callInterval: game.callInterval, nextCallAt, prizeTokens: game.prizeTokens, prizeText: game.prizeText,
    winnerName: game.winnerName, players: await cardCount(game.id),
  };
}
