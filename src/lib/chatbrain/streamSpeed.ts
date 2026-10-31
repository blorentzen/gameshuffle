import "server-only";

/**
 * Chat Brain on stream: the speed round (specs/gs-originals-chat-brain-stream.md,
 * "Speed round", build step 5).
 *
 * One window per board stays open while the board is in play. Each `!a` is
 * judged as it arrives: the first viewer to match a hidden answer reveals it
 * (brain_stream_reveals' primary key makes the first insert win), takes its
 * points as play-along points, and restarts the 20-second timer. When the
 * timer runs out with no find, that's a strike; three strikes or a cleared
 * board ends the board, and the host moves on with `!cb next`.
 *
 * The window's closes_at is the strike timer and doubles as a version: every
 * find and every strike moves it with a conditional update on the old value,
 * so two servers can't both strike, and a stale cache can't strike early.
 * The window's record (answer jsonb) keeps who found what and when the
 * strikes fell.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { MAX_ANSWER_LENGTH, matchGuess, normalize } from "./rules";
import { SPEED_SECONDS, STRIKES_PER_BOARD, findLine, speedStrikeLine } from "./streamRules";
import { forgetChannel, openWindowFor, type GuessResult, type Platform, type StreamWindow } from "./stream";
import { addPlayAlong, endBoard, loadBoard, loadGame, loadReveals, loadTeam, say, type StreamBoard } from "./streamGame";

const CHAT_TEAM = 1;

export interface SpeedRecord {
  speed: true;
  /** rank → who found it and when. */
  finds: Record<string, { name: string; at: string }>;
  /** When each strike fell. */
  strikes: string[];
}

export const speedMeta = (): SpeedRecord => ({ speed: true, finds: {}, strikes: [] });

function asRecord(v: unknown): SpeedRecord {
  const r = (v ?? {}) as Partial<SpeedRecord>;
  return { speed: true, finds: { ...(r.finds ?? {}) }, strikes: [...(r.strikes ?? [])] };
}

const iso = (ms: number) => new Date(ms).toISOString();

// ─── the board a speed window belongs to (cached: one window = one board) ───

type Ctx = { gameId: string; board: StreamBoard; broadcasterId: string };
const ctxCache = new Map<string, Ctx | null>();

async function contextFor(w: StreamWindow): Promise<Ctx | null> {
  if (ctxCache.has(w.id)) return ctxCache.get(w.id) ?? null;
  const game = w.gameId ? await loadGame(w.gameId) : null;
  const board = game ? await loadBoard(game.board_ids[game.current_board]) : null;
  const ctx = game && board && game.status === "playing" && board.promptId === w.boardId
    ? { gameId: game.id, board, broadcasterId: w.broadcasterId }
    : null;
  ctxCache.set(w.id, ctx);
  if (ctxCache.size > 100) ctxCache.delete(ctxCache.keys().next().value!);
  return ctx;
}

/** Chat's total in a speed game: every answer a viewer found. */
export async function speedScore(gameId: string): Promise<number> {
  const { data } = await createServiceClient().from("brain_stream_reveals").select("points").eq("game_id", gameId).eq("team", CHAT_TEAM);
  return ((data ?? []) as { points: number }[]).reduce((n, r) => n + r.points, 0);
}

/** Keep the chat team's score in step (finds can land at the same moment, so it's recounted). */
export async function syncSpeedScore(gameId: string): Promise<number> {
  const score = await speedScore(gameId);
  await createServiceClient().from("brain_stream_teams").update({ score }).eq("game_id", gameId).eq("team", CHAT_TEAM);
  return score;
}

// ─── a guess ─────────────────────────────────────────────────────────────────

/** A viewer's `!a` during a speed board: a find if it's the first to match a hidden answer. */
export async function speedGuess(window: StreamWindow, input: { platform: Platform; viewer: string; name?: string | null; raw: string }): Promise<GuessResult> {
  if (Date.parse(window.opensAt) > Date.now()) return "no_window";
  let w: StreamWindow | null = window;
  // The cached timer may be stale (a find elsewhere moved it): check the real one.
  if (Date.parse(w.closesAt) <= Date.now()) {
    await speedTimeout(w.id);
    w = await openWindowFor(window.broadcasterId, { fresh: true });
    if (!w || w.id !== window.id) return "closed";
  }
  const raw = input.raw.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER_LENGTH);
  const normalized = normalize(raw);
  if (!raw || !normalized || isBlockedText(raw)) return "rejected";
  const svc = createServiceClient();
  const name = input.name?.slice(0, 40) || "Someone";
  // Kept for the count on stream; the find is decided below.
  await svc.from("brain_stream_guesses").upsert({
    window_id: w.id, platform: input.platform, viewer: input.viewer, name, raw, normalized, created_at: iso(Date.now()),
  }, { onConflict: "window_id,platform,viewer" });

  const ctx = await contextFor(w);
  if (!ctx) return "saved";
  const hit = matchGuess(normalized, ctx.board.answers, []);
  if (!hit) return "saved";
  const { error } = await svc.from("brain_stream_reveals").insert({
    game_id: ctx.gameId, board_id: ctx.board.id, rank: hit.rank, team: CHAT_TEAM, points: hit.points, window_id: w.id,
  });
  // Someone got there first, or the board is already over.
  if (error) return "saved";
  await onFind(ctx, w.id, { key: `${input.platform}:${input.viewer}`, name, rank: hit.rank, points: hit.points, label: hit.label });
  return "saved";
}

async function onFind(ctx: Ctx, windowId: string, find: { key: string; name: string; rank: number; points: number; label: string }): Promise<void> {
  const svc = createServiceClient();
  await addPlayAlong(ctx.gameId, new Map([[find.key, { rank: find.rank, points: find.points, name: find.name }]]), windowId);
  const at = iso(Date.now());
  // Record who found it and restart the timer. closes_at is the version: a
  // find at the same moment moves it first, so wait a beat, read again and
  // retry (a burst of finds on a busy board can clash several times). Once the
  // board is over (another find cleared it) the name is still recorded; the
  // timer just isn't restarted, and the version moves by a millisecond.
  for (let i = 0; i < 25; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
    const { data } = await svc.from("brain_stream_windows").select("status, closes_at, answer").eq("id", windowId).maybeSingle();
    const row = data as { status: string; closes_at: string; answer: unknown } | null;
    if (!row) break;
    const rec = asRecord(row.answer);
    rec.finds[String(find.rank)] = { name: find.name, at };
    const next = row.status === "open" ? Date.now() + SPEED_SECONDS * 1000 : Date.parse(row.closes_at) + 1;
    const { data: moved } = await svc.from("brain_stream_windows").update({ answer: rec, closes_at: iso(next) })
      .eq("id", windowId).eq("closes_at", row.closes_at).select("id").maybeSingle();
    if (moved) break;
  }
  forgetChannel(ctx.broadcasterId);

  const reveals = await loadReveals(ctx.gameId, ctx.board.id);
  const left = Math.max(0, ctx.board.answers.length - reveals.length);
  const score = await syncSpeedScore(ctx.gameId);
  await say(ctx.broadcasterId, findLine({ name: find.name, rank: find.rank, label: find.label, points: find.points, left }));
  if (left > 0) return;
  // Cleared: whoever closes the window ends the board.
  const { data: closed } = await svc.from("brain_stream_windows").update({ status: "closed", closed_at: iso(Date.now()), result: "hit" })
    .eq("id", windowId).eq("status", "open").select("id").maybeSingle();
  if (!closed) return;
  forgetChannel(ctx.broadcasterId);
  const [game, team] = await Promise.all([loadGame(ctx.gameId), loadTeam(ctx.gameId)]);
  if (game && team) await endBoard(game, { ...team, score }, ctx.board);
}

// ─── the strike timer ────────────────────────────────────────────────────────

/**
 * The timer ran out with no find: a strike, and the timer starts again; the
 * third ends the board. Called by every read that notices the time is up
 * (overlay, dashboard, the live page, a guess) and the polls sweep; the
 * conditional update on closes_at lets exactly one of them strike.
 */
export async function speedTimeout(windowId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc.from("brain_stream_windows").select("id, game_id, broadcaster_id, board_id, status, closes_at, answer").eq("id", windowId).maybeSingle();
  const row = data as { id: string; game_id: string | null; broadcaster_id: string; board_id: string | null; status: string; closes_at: string; answer: unknown } | null;
  if (!row || row.status !== "open" || Date.parse(row.closes_at) > Date.now()) return false;

  const game = row.game_id ? await loadGame(row.game_id) : null;
  const [team, board] = game ? await Promise.all([loadTeam(game.id), loadBoard(game.board_ids[game.current_board])]) : [null, null];
  if (!game || !team || !board || game.status !== "playing" || board.promptId !== row.board_id) {
    await svc.from("brain_stream_windows").update({ status: "closed", closed_at: iso(Date.now()) }).eq("id", row.id).eq("status", "open");
    forgetChannel(row.broadcaster_id);
    return false;
  }

  const now = Date.now();
  const rec = asRecord(row.answer);
  rec.strikes.push(iso(now));
  const strikes = team.strikes + 1;
  const over = strikes >= STRIKES_PER_BOARD;
  const patch = over
    ? { status: "closed", closed_at: iso(now), result: "miss", answer: rec }
    : { closes_at: iso(now + SPEED_SECONDS * 1000), answer: rec };
  const { data: won } = await svc.from("brain_stream_windows").update(patch)
    .eq("id", row.id).eq("status", "open").eq("closes_at", row.closes_at).select("id").maybeSingle();
  if (!won) return false;
  forgetChannel(row.broadcaster_id);
  await svc.from("brain_stream_teams").update({ strikes }).eq("game_id", game.id).eq("team", CHAT_TEAM);
  if (over) {
    await endBoard(game, { ...team, strikes, score: await syncSpeedScore(game.id) }, board);
  } else {
    const reveals = await loadReveals(game.id, board.id);
    await say(row.broadcaster_id, speedStrikeLine({ strikes, left: Math.max(0, board.answers.length - reveals.length) }));
  }
  return true;
}

// ─── for the views ───────────────────────────────────────────────────────────

export interface SpeedExtras {
  /** rank → who found it. */
  finders: Map<number, string>;
  /** The latest find or strike on this board. */
  last: { kind: "find"; rank: number; name: string; at: string } | { kind: "strike"; at: string } | null;
  guesses: number;
}

const extrasCache = new Map<string, { at: number; value: SpeedExtras }>();

/** Who found what on this board, the latest moment, and how many have guessed (cached a second). */
export async function speedExtras(gameId: string, boardPromptId: string): Promise<SpeedExtras> {
  const k = `${gameId}:${boardPromptId}`;
  const hit = extrasCache.get(k);
  if (hit && Date.now() - hit.at < 1000) return hit.value;
  const svc = createServiceClient();
  const { data } = await svc.from("brain_stream_windows").select("id, answer").eq("game_id", gameId).eq("board_id", boardPromptId)
    .order("opens_at", { ascending: false }).limit(1).maybeSingle();
  const row = data as { id: string; answer: unknown } | null;
  const rec = asRecord(row?.answer);
  const finders = new Map<number, string>(Object.entries(rec.finds).map(([rank, f]) => [Number(rank), f.name]));
  const events = [
    ...Object.entries(rec.finds).map(([rank, f]) => ({ kind: "find" as const, rank: Number(rank), name: f.name, at: f.at })),
    ...rec.strikes.map((at) => ({ kind: "strike" as const, at })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  let guesses = 0;
  if (row) {
    const { count } = await svc.from("brain_stream_guesses").select("viewer", { count: "exact", head: true }).eq("window_id", row.id);
    guesses = count ?? 0;
  }
  const value: SpeedExtras = { finders, last: events[0] ?? null, guesses };
  extrasCache.set(k, { at: Date.now(), value });
  if (extrasCache.size > 200) extrasCache.delete(extrasCache.keys().next().value!);
  return value;
}
