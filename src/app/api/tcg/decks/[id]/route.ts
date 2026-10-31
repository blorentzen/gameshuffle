/**
 * TCG deck lists: one of yours.
 *
 * GET               → { deck }
 * GET ?cards=1      → { name, cards }   its matched catalog cards (the companion's picker)
 * PATCH { name?, text? } → { deck }
 * DELETE            → { ok }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deckCards, deleteDeck, getDeck, updateDeck } from "@/lib/tcg/decks";
import { parseDeckText } from "@/lib/tcg/deckList";
import { deckError } from "../errors";

export const runtime = "nodejs";
const MAX_TEXT = 20_000;
const ID = /^[0-9a-f-]{36}$/i;

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!ID.test(id)) return deckError("not_found");
  if (new URL(request.url).searchParams.get("cards")) {
    const result = await deckCards(userId, id);
    if (!result.ok) return deckError(result.error);
    return NextResponse.json(result.value, { headers: { "cache-control": "no-store" } });
  }
  const result = await getDeck(userId, id);
  if (!result.ok) return deckError(result.error);
  return NextResponse.json({ deck: result.value }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!ID.test(id)) return deckError("not_found");
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; text?: unknown };
  const lines = typeof body.text === "string" ? parseDeckText(body.text.slice(0, MAX_TEXT)).lines : undefined;
  const result = await updateDeck(userId, id, { name: body.name, lines });
  if (!result.ok) return deckError(result.error);
  return NextResponse.json({ deck: result.value });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!ID.test(id)) return deckError("not_found");
  const result = await deleteDeck(userId, id);
  if (!result.ok) return deckError(result.error);
  return NextResponse.json({ ok: true });
}
