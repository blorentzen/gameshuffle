/**
 * Community Bingo tool (Streamer Tools Integration, Phase 3). A single shared
 * board per streamer (owner-keyed) of "stream moment" prompts. Squares are
 * marked from chat or the Hub; each change records a *persistent* overlay event
 * carrying the full board (so a mid-game OBS reload restores it, and the newest
 * event replaces the prior one). A completed line pops a "BINGO!" celebration.
 *
 * Prompt pool + look are streamer-owned (§3.4) — read from the `bingo` module
 * default; the registry default pool backstops an unconfigured streamer.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { getStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
import { DEFAULT_BINGO_PROMPTS } from "@/lib/modules/registry";
import { trackServerEvent } from "@/lib/analytics/server";
import type { ToolSource } from "./dice";

const MIN_SIZE = 3;
const MAX_SIZE = 5;

export interface BingoBoard {
  size: number;
  squares: string[]; // length size*size
  marked: number[]; // marked square indexes
  freeCenter: boolean;
  lines: number; // count of completed lines
}

interface BoardRow {
  size: number;
  squares: string[] | null;
  marked: number[] | null;
  free_center: boolean;
}

/** The streamer's bingo customization (pool + look + size), with fallbacks. */
export async function getBingoConfig(ownerUserId: string) {
  const cfg = await getStreamerModuleDefault({
    ownerUserId,
    moduleId: "bingo",
    gameSlug: "*",
  });
  const prompts =
    cfg?.prompts && cfg.prompts.length >= 8 ? cfg.prompts : DEFAULT_BINGO_PROMPTS;
  return {
    prompts,
    accentColor: cfg?.accentColor ?? "#7c3aed",
    size: clampSize(cfg?.size ?? 5),
    freeCenter: cfg?.freeCenter ?? true,
  };
}

function clampSize(n: number): number {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)));
}

function centerIndex(size: number): number | null {
  return size % 2 === 1 ? Math.floor((size * size) / 2) : null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Count completed lines (rows, cols, diagonals) for a size×size grid given the
 * set of marked indexes. Exported for unit testing.
 */
export function countBingoLines(size: number, marked: Set<number>): number {
  const isMarked = (r: number, c: number) => marked.has(r * size + c);
  let lines = 0;
  for (let r = 0; r < size; r++) {
    let all = true;
    for (let c = 0; c < size; c++) if (!isMarked(r, c)) { all = false; break; }
    if (all) lines++;
  }
  for (let c = 0; c < size; c++) {
    let all = true;
    for (let r = 0; r < size; r++) if (!isMarked(r, c)) { all = false; break; }
    if (all) lines++;
  }
  let diag = true;
  for (let i = 0; i < size; i++) if (!isMarked(i, i)) { diag = false; break; }
  if (diag) lines++;
  let anti = true;
  for (let i = 0; i < size; i++) if (!isMarked(i, size - 1 - i)) { anti = false; break; }
  if (anti) lines++;
  return lines;
}

function toBoard(row: BoardRow): BingoBoard {
  const marked = new Set(row.marked ?? []);
  return {
    size: row.size,
    squares: row.squares ?? [],
    marked: [...marked],
    freeCenter: row.free_center,
    lines: countBingoLines(row.size, marked),
  };
}

async function recordBoardEvent(
  ownerUserId: string,
  sessionId: string | null | undefined,
  board: BingoBoard,
  accentColor: string,
  justWon: boolean,
): Promise<void> {
  await recordOverlayEvent({
    ownerUserId,
    sessionId: sessionId ?? null,
    type: "bingo",
    payload: {
      size: board.size,
      squares: board.squares,
      marked: board.marked,
      freeCenter: board.freeCenter,
      lines: board.lines,
      accentColor,
      justWon,
      cleared: false,
    },
    ttlMs: null, // persistent — replaced by the next board event
  });
}

/** Start a fresh board: sample size*size prompts, auto-mark the free center. */
export async function newBingoBoard(args: {
  ownerUserId: string;
  sessionId?: string | null;
  size?: number;
  source?: ToolSource;
}): Promise<BingoBoard> {
  const cfg = await getBingoConfig(args.ownerUserId);
  const size = clampSize(args.size ?? cfg.size);
  const count = size * size;

  // Sample without replacement; pad by cycling if the pool is smaller than the
  // grid (clampSize + the ≥8 pool floor keep this rare, but be safe).
  const pool = shuffle(cfg.prompts);
  const squares: string[] = [];
  for (let i = 0; i < count; i++) squares.push(pool[i % pool.length]);

  const center = cfg.freeCenter ? centerIndex(size) : null;
  const marked = center != null ? [center] : [];

  const admin = createServiceClient();
  await admin.from("gs_bingo_boards").upsert(
    {
      owner_user_id: args.ownerUserId,
      session_id: args.sessionId ?? null,
      size,
      squares,
      marked,
      free_center: cfg.freeCenter,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_user_id" },
  );

  void trackServerEvent("Streamer Tool", {
    props: { tool: "bingo", surface: args.source ?? "unknown", action: "new", size },
  });

  const board = toBoard({ size, squares, marked, free_center: cfg.freeCenter });
  await recordBoardEvent(args.ownerUserId, args.sessionId, board, cfg.accentColor, false);
  return board;
}

/** Read the streamer's current board (null if none). */
export async function getActiveBingoBoard(ownerUserId: string): Promise<BingoBoard | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_bingo_boards")
    .select("size, squares, marked, free_center")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (!data || !(data as BoardRow).squares?.length) return null;
  return toBoard(data as BoardRow);
}

export interface MarkResult {
  board: BingoBoard | null;
  newBingo: boolean;
  error?: "no_board" | "out_of_range";
}

/** Toggle a square (1-indexed for chat friendliness). Recomputes bingo lines. */
export async function markBingoSquare(args: {
  ownerUserId: string;
  sessionId?: string | null;
  /** 1-indexed square number as spoken in chat / clicked in the Hub. */
  square: number;
  source?: ToolSource;
}): Promise<MarkResult> {
  const cfg = await getBingoConfig(args.ownerUserId);
  const existing = await getActiveBingoBoard(args.ownerUserId);
  if (!existing) return { board: null, newBingo: false, error: "no_board" };

  const idx = Math.round(args.square) - 1;
  if (idx < 0 || idx >= existing.size * existing.size) {
    return { board: existing, newBingo: false, error: "out_of_range" };
  }

  const center = existing.freeCenter ? centerIndex(existing.size) : null;
  const marked = new Set(existing.marked);
  const linesBefore = countBingoLines(existing.size, marked);
  if (idx === center) {
    // Free center stays marked — no-op toggle.
    return { board: existing, newBingo: false };
  }
  if (marked.has(idx)) marked.delete(idx);
  else marked.add(idx);
  const linesAfter = countBingoLines(existing.size, marked);
  const newBingo = linesAfter > linesBefore;

  const admin = createServiceClient();
  await admin
    .from("gs_bingo_boards")
    .update({ marked: [...marked], updated_at: new Date().toISOString() })
    .eq("owner_user_id", args.ownerUserId);

  void trackServerEvent("Streamer Tool", {
    props: { tool: "bingo", surface: args.source ?? "unknown", action: "mark" },
  });

  const board: BingoBoard = {
    ...existing,
    marked: [...marked],
    lines: linesAfter,
  };
  await recordBoardEvent(args.ownerUserId, args.sessionId, board, cfg.accentColor, newBingo);
  return { board, newBingo };
}

/** Clear the board off the overlay + delete the row. */
export async function clearBingoBoard(args: {
  ownerUserId: string;
  sessionId?: string | null;
  source?: ToolSource;
}): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_bingo_boards").delete().eq("owner_user_id", args.ownerUserId);

  void trackServerEvent("Streamer Tool", {
    props: { tool: "bingo", surface: args.source ?? "unknown", action: "clear" },
  });

  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "bingo",
    payload: { cleared: true },
    ttlMs: null,
  });
}
