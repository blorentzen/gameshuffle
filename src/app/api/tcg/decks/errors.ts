/** TCG deck lists: plain-words errors and statuses for the deck routes. */

import { NextResponse } from "next/server";
import type { DeckError } from "@/lib/tcg/decks";
import { FREE_DECK_LIMIT } from "@/lib/tcg/deckList";

const STATUS: Record<DeckError, number> = { missing: 503, not_found: 404, limit: 402, empty: 400, bad_name: 400, busy: 500 };
const MESSAGE: Record<DeckError, string> = {
  missing: "Deck lists aren't switched on yet.",
  not_found: "That deck isn't here any more.",
  limit: `Free accounts keep ${FREE_DECK_LIMIT} decks. Delete one, or GS Pro keeps as many as you like.`,
  empty: "That list has no cards we could read.",
  bad_name: "Give the deck a name.",
  busy: "That didn't save. Try again.",
};

export function deckError(error: DeckError) {
  return NextResponse.json({ error, message: MESSAGE[error] }, { status: STATUS[error] });
}
