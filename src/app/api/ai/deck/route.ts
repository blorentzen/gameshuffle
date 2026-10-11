/**
 * POST /api/ai/deck  { family, kind, theme?, avoid? } → { ok, cards, remaining }
 *
 * Drafts deck cards (Chance cards, missions or house rules) for the owner to
 * tick and add to their deck as drafts. GS Pro, counted against the 30-day AI
 * allowance. Nothing is saved here.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { generateDeckCards, isAiDeckKind } from "@/lib/ai/decks";
import { deckFamily } from "@/lib/cards/families";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await aiAccess("deck");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });

  const body = (await request.json().catch(() => null)) as { family?: unknown; kind?: unknown; theme?: unknown; avoid?: unknown } | null;
  const family = typeof body?.family === "string" ? body.family : "";
  const theme = typeof body?.theme === "string" ? body.theme.trim().slice(0, 200) : "";
  if (!deckFamily(family) || !isAiDeckKind(body?.kind)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const avoid = Array.isArray(body?.avoid) ? body.avoid.filter((x): x is string => typeof x === "string").slice(0, 100) : [];

  const { value: res, tokens } = await withAiTokens(() => generateDeckCards(family, body.kind as Parameters<typeof generateDeckCards>[1], theme, avoid));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "deck", tokens);
  return NextResponse.json({ ok: true, cards: res.data, remaining: access.remaining === null ? null : access.remaining - 1 });
}
