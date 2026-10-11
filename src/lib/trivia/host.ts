import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TriviaNotReady, getGame, type GameRow } from "./store";

/** The signed-in host and, with an id, their game. Hosting is free; it needs an account. */
export async function triviaHost(gameId?: string): Promise<{ ok: true; userId: string; game: GameRow | null } | { ok: false; response: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 }) };
  if (!gameId) return { ok: true, userId: user.id, game: null };
  try {
    const game = await getGame(gameId);
    if (!game || game.host_user_id !== user.id) return { ok: false, response: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
    return { ok: true, userId: user.id, game };
  } catch (err) {
    if (err instanceof TriviaNotReady) return { ok: false, response: NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 }) };
    throw err;
  }
}

export function notReadyResponse(err: unknown): NextResponse | null {
  return err instanceof TriviaNotReady ? NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 }) : null;
}
