/**
 * Platform ▸ Trivia (staff/admin): the GameShuffle question pack.
 *   GET  → every pack question (any status), counts, and how many starter
 *          questions aren't imported yet
 *   POST { action: "import" }                 → add the starter pack as drafts
 *        { action: "status", ids, status }    → approve / retire / back to draft
 *        { action: "update", id, question }   → fix a question's wording or answer line
 *        { action: "draft-game", game, count } → Claude drafts a pack about one game (drafts to check)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { TRIVIA_PACK } from "@/data/originals/trivia-pack";
import { TriviaNotReady, importPack, packAdminList, packBankMissing, setPackStatus, updatePackQuestion, type QuestionInput } from "@/lib/trivia/store";
import { draftGamePack, gameTags, packGames } from "@/lib/trivia/gamePacks";
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
    const [{ questions, counts }, missing, tags] = await Promise.all([packAdminList(), packBankMissing(TRIVIA_PACK), gameTags()]);
    return NextResponse.json(
      { ok: true, questions, counts, bank: { total: TRIVIA_PACK.length, missing }, games: { ready: tags !== null, list: packGames(), tags: tags ?? {} } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return notReady(err) ?? NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { action?: string; ids?: string[]; status?: string; id?: string; question?: QuestionInput; game?: string; count?: number } | null;
  try {
    if (body?.action === "import") return NextResponse.json({ ok: true, ...(await importPack(TRIVIA_PACK)) });
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
