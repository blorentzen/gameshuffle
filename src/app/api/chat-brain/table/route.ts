import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { matchGuess } from "@/lib/chatbrain/rules";
import { brainTableOpenFor } from "@/lib/chatbrain/tableGate";
import { brainPool, loadBrainBoard, pickBrainBoards } from "@/lib/activity/roomBrain";

export const runtime = "nodejs";

/**
 * /api/chat-brain/table: Chat Brain on one phone (/game-nights/tools/chat-brain).
 * The answers stay here until a board is over, so the phone never holds them.
 *   GET  ?boards=N&skip=id,id → { boards: [{ id, question, size }] } (public family-safe boards; dev adds test boards)
 *   POST { board, guess, found } → { hit: { rank, label, points } | null, already }
 *   POST { board, reveal: true } → { answers: [{ rank, label, points }] } (the board is over)
 * Staff only until Chat Brain launches (tableGate.ts): 404 for everyone else.
 */

async function open(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return brainTableOpenFor(user?.id ?? null).catch(() => false);
}

const ipOf = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export async function GET(req: NextRequest) {
  if (!(await open())) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { ok: under } = await rateLimit(`brain-table-get:${ipOf(req)}`, { max: 30, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const count = Math.min(5, Math.max(1, Number(req.nextUrl.searchParams.get("boards")) || 3));
  const skip = (req.nextUrl.searchParams.get("skip") ?? "").split(",").filter(Boolean).slice(0, 200).map((id) => `brain:${id}`);
  const ids = await pickBrainBoards(count, skip);
  const boards = (await Promise.all(ids.map(async (id) => {
    const b = await loadBrainBoard(id);
    return b ? { id, question: b.question, size: b.answers.length } : null;
  }))).filter((b): b is { id: string; question: string; size: number } => !!b);
  return NextResponse.json({ ok: true, boards }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await open())) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { ok: under } = await rateLimit(`brain-table:${ipOf(req)}`, { max: 120, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { board?: unknown; guess?: unknown; found?: unknown; reveal?: unknown };
  const id = typeof body.board === "string" ? body.board : "";
  if (!id || !(await brainPool()).includes(id)) return NextResponse.json({ ok: false, error: "no_board" }, { status: 404 });
  const board = await loadBrainBoard(id);
  if (!board) return NextResponse.json({ ok: false, error: "no_board" }, { status: 404 });
  if (body.reveal === true) {
    return NextResponse.json({ ok: true, answers: [...board.answers].sort((a, b) => a.rank - b.rank).map((a) => ({ rank: a.rank, label: a.label, points: a.points })) });
  }
  const guess = typeof body.guess === "string" ? body.guess.trim().slice(0, 40) : "";
  if (!guess) return NextResponse.json({ ok: false, error: "bad_guess" }, { status: 400 });
  const found = Array.isArray(body.found) ? body.found.map(Number).filter((n) => Number.isInteger(n)) : [];
  const hit = matchGuess(guess, board.answers, found);
  if (hit) return NextResponse.json({ ok: true, hit: { rank: hit.rank, label: hit.label, points: hit.points }, already: false });
  const again = matchGuess(guess, board.answers, []);
  return NextResponse.json({ ok: true, hit: again ? { rank: again.rank, label: again.label, points: again.points } : null, already: !!again });
}
