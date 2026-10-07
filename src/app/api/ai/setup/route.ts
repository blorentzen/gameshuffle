/**
 * POST /api/ai/setup  { game, text } → { ok, options, remaining }
 *
 * Plain-language setup for a randomizer: what someone typed becomes that
 * randomizer's options (src/lib/ai/setup.ts). The randomizer still rolls.
 * Free with a daily cap for signed-in accounts; GS Pro counts it against the
 * 30-day AI allowance.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { isSetupGame, readSetup } from "@/lib/ai/setup";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await aiAccess("setup");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });
  const body = (await request.json().catch(() => null)) as { game?: unknown; text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 300) : "";
  if (!isSetupGame(body?.game) || text.length < 3) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const game = body.game;
  const { value: res, tokens } = await withAiTokens(() => readSetup(game, text));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "setup", tokens);
  return NextResponse.json({ ok: true, options: res.data, remaining: access.remaining === null ? null : access.remaining - 1 });
}
