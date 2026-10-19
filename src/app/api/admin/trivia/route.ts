/**
 * Platform ▸ Trivia (staff/admin): the GameShuffle question pack.
 *   GET  → every pack question (any status), counts, and how many starter
 *          questions aren't imported yet
 *   POST { action: "import" }                 → add the starter pack as drafts
 *        { action: "status", ids, status }    → approve / retire / back to draft
 *        { action: "update", id, question }   → fix a question's wording or answer line
 *        { action: "draft-game", game, count } → Claude drafts a pack about one game (drafts to check)
 *   Fire Round's four choices (src/lib/fireRound/choices.ts):
 *        { action: "wrong-fill" }                → the starter pack's handwritten wrong answers, as drafts
 *        { action: "wrong-approve", ids }        → wrong answers checked
 *        { action: "wrong-update", id, wrong }   → staff's own three (saved as checked)
 *        { action: "wrong-draft" }               → Claude drafts wrong answers for up to 30 questions with none
 *        { action: "draft-category", category, count } → Claude drafts new questions (with wrong answers) for a category
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { TRIVIA_PACK } from "@/data/originals/trivia-pack";
import { TriviaNotReady, importPack, packAdminList, packBankMissing, setPackStatus, updatePackQuestion, type QuestionInput } from "@/lib/trivia/store";
import { draftGamePack, gameTags, packGames } from "@/lib/trivia/gamePacks";
import { approveWrong, choicesAdmin, draftCategory, draftWrong, fillPackWrong, updateWrong } from "@/lib/fireRound/choices";
import { withAiTokens } from "@/lib/ai/tokens";
import { recordAiUse } from "@/lib/ai/usage";

export const runtime = "nodejs";
// Drafting a 30-question game pack with Claude can take a minute or two.
export const maxDuration = 180;

const notReady = (err: unknown) => (err instanceof TriviaNotReady ? NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 }) : null);

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  try {
    const [{ questions, counts }, missing, tags, choices] = await Promise.all([packAdminList(), packBankMissing(TRIVIA_PACK), gameTags(), choicesAdmin()]);
    return NextResponse.json(
      { ok: true, questions, counts, bank: { total: TRIVIA_PACK.length, missing }, games: { ready: tags !== null, list: packGames(), tags: tags ?? {} }, choices },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return notReady(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { action?: string; ids?: string[]; status?: string; id?: string; question?: QuestionInput; game?: string; count?: number; wrong?: unknown; category?: string } | null;
  try {
    if (body?.action === "import") {
      const imported = await importPack(TRIVIA_PACK);
      // The starter pack's wrong answers for Fire Round's four choices, as drafts (no-op before fire-round-m1).
      const { filled } = await fillPackWrong();
      return NextResponse.json({ ok: true, ...imported, wrongFilled: filled });
    }
    if (body?.action === "wrong-fill") return NextResponse.json({ ok: true, ...(await fillPackWrong()) });
    if (body?.action === "wrong-approve" && Array.isArray(body.ids)) return NextResponse.json({ ok: true, changed: await approveWrong(body.ids) });
    if (body?.action === "wrong-update" && body.id) {
      const r = await updateWrong(body.id, body.wrong);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    if (body?.action === "wrong-draft") {
      const { value: r, tokens } = await withAiTokens(() => draftWrong(30));
      if (tokens.calls > 0) await recordAiUse(gate.userId, "trivia", tokens);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "none" ? 409 : r.error === "not_ready" ? 503 : 502 });
      return NextResponse.json({ ok: true, ...r.data });
    }
    if (body?.action === "draft-category" && typeof body.category === "string") {
      const count = [10, 20, 30].includes(Number(body.count)) ? Number(body.count) : 20;
      const { value: r, tokens } = await withAiTokens(() => draftCategory(body.category!, count));
      if (tokens.calls > 0) await recordAiUse(gate.userId, "trivia", tokens);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_ready" ? 503 : r.error === "unknown_category" ? 400 : 502 });
      return NextResponse.json({ ok: true, ...r.data });
    }
    if (body?.action === "status" && Array.isArray(body.ids) && ["draft", "approved", "retired"].includes(body.status ?? "")) {
      return NextResponse.json({ ok: true, changed: await setPackStatus(body.ids, body.status as "draft" | "approved" | "retired") });
    }
    if (body?.action === "update" && body.id && body.question) {
      const r = await updatePackQuestion(body.id, body.question);
      return r.ok ? NextResponse.json({ ok: true, question: r.question }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    if (body?.action === "draft-game" && typeof body.game === "string") {
      const count = [10, 20, 30].includes(Number(body.count)) ? Number(body.count) : 20;
      const { value: r, tokens } = await withAiTokens(() => draftGamePack(body.game!, count));
      if (tokens.calls > 0) await recordAiUse(gate.userId, "trivia", tokens);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_ready" ? 503 : r.error === "unknown_game" ? 400 : 502 });
      return NextResponse.json({ ok: true, ...r.data });
    }
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  } catch (err) {
    return notReady(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
