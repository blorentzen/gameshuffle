/**
 * POST /api/ai/pack  { kind, theme, avoid? } → { ok, items, remaining }
 *
 * Drafts a content pack (wheel slices, bingo squares, tier list items, Most
 * Likely To prompts, Odd One Out pairs) for the streamer to edit and approve.
 * GS Pro, counted against the 30-day AI allowance. Nothing is saved here.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { generatePack, isPackKind } from "@/lib/ai/packs";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await aiAccess("pack");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });

  const body = (await request.json().catch(() => null)) as { kind?: unknown; theme?: unknown; avoid?: unknown } | null;
  const theme = typeof body?.theme === "string" ? body.theme.trim().slice(0, 200) : "";
  if (!isPackKind(body?.kind) || theme.length < 3) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const avoid = Array.isArray(body?.avoid) ? body.avoid.filter((x): x is string => typeof x === "string").slice(0, 100) : [];

  const { value: res, tokens } = await withAiTokens(() => generatePack(body.kind as Parameters<typeof generatePack>[0], theme, avoid));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "pack", tokens);
  return NextResponse.json({ ok: true, items: res.data, remaining: access.remaining === null ? null : access.remaining - 1 });
}
