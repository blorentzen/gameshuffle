/**
 * POST /api/ai/tournament  { game, players, minutes, notes, allowHeat } → { ok, draft, remaining }
 *
 * Suggests a format and drafts the description, rules and an announcement for
 * the create form. Free with a daily cap while Circuit is in preview.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { draftTournament } from "@/lib/ai/tournament";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await aiAccess("tournament");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });
  const b = (await request.json().catch(() => null)) as { game?: unknown; players?: unknown; minutes?: unknown; notes?: unknown; allowHeat?: unknown } | null;
  const game = typeof b?.game === "string" ? b.game.trim().slice(0, 80) : "";
  const players = Math.max(2, Math.min(256, Number(b?.players) || 0));
  const minutes = Math.max(30, Math.min(720, Number(b?.minutes) || 0));
  if (!game || !players || !minutes) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const notes = typeof b?.notes === "string" ? b.notes.slice(0, 400) : "";

  const { value: res, tokens } = await withAiTokens(() => draftTournament({ game, players, minutes, notes, allowHeat: b?.allowHeat !== false }));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "tournament", tokens);
  return NextResponse.json({ ok: true, draft: res.data, remaining: access.remaining === null ? null : access.remaining - 1 });
}
