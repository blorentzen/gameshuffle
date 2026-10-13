/**
 * TCG deck lists: yours, and saving a new one.
 *
 * GET [?format=expanded|any]        → { ready, decks, limit }  (limit null = GS Pro, no limit)
 * POST { name, text }               → { deck }   save a pasted list
 * POST { guide: slug, name? }       → { deck }   copy one of our deck guides
 *
 * One deck: /api/tcg/decks/[id]. A paste checked without saving: /api/tcg/decks/check.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { createDeck, decksReady, guideLines, listDecks } from "@/lib/tcg/decks";
import { parseDeckText } from "@/lib/tcg/deckList";
import { deckError } from "./errors";

export const runtime = "nodejs";
const MAX_TEXT = 20_000;

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await decksReady())) return NextResponse.json({ ready: false, decks: [], limit: null });
  // ?format=expanded|any checks the decks against a tournament's format.
  const format = new URL(request.url).searchParams.get("format");
  const result = await listDecks(userId, format === "expanded" || format === "any" ? format : undefined);
  if (!result.ok) return deckError(result.error);
  return NextResponse.json({ ready: true, ...result.value }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: "unauthenticated", message: "Sign in to save decks." }, { status: 401 });
  const { ok } = await rateLimit(`tcg-decks-save:${userId}`, { max: 20, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down", message: "That's a lot of decks at once. Wait a minute." }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; text?: unknown; guide?: unknown };
  if (typeof body.guide === "string") {
    const guide = guideLines(body.guide);
    if (!guide) return NextResponse.json({ error: "not_found", message: "That guide has no list we can copy." }, { status: 404 });
    const result = await createDeck(userId, { name: body.name ?? guide.name, lines: guide.lines, source: `guide:${body.guide}` });
    if (!result.ok) return deckError(result.error);
    return NextResponse.json({ deck: result.value });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  const { lines } = parseDeckText(text);
  const result = await createDeck(userId, { name: body.name, lines, source: "paste" });
  if (!result.ok) return deckError(result.error);
  return NextResponse.json({ deck: result.value });
}
