/**
 * TCG deck lists: check a pasted list without saving it.
 * POST { text } → { view, skipped }  (lines matched to the catalog, checks, what you own)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { previewText } from "@/lib/tcg/decks";

export const runtime = "nodejs";
const MAX_TEXT = 20_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated", message: "Sign in to check a deck." }, { status: 401 });
  // A paste can look up cards we've never fetched, so keep it to a sensible pace.
  const { ok } = await rateLimit(`tcg-decks-check:${user.id}`, { max: 15, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down", message: "Too many checks at once. Wait a minute." }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  if (!text.trim()) return NextResponse.json({ error: "empty", message: "Paste a deck list first." }, { status: 400 });
  const result = await previewText(user.id, text);
  return NextResponse.json(result);
}
