/**
 * Play together (TCG Companion): start a shared game, or find yours.
 *
 * GET                → { ready, mine: { code, opponent } | null }
 * POST { state, mode } → share this phone's game (signed in, GS Pro) → { view }
 *
 * Moves, joining and the board live on /api/companion/live/[code].
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { createLiveGame, liveReady, myOpenGame } from "@/lib/companion/live";
import type { SessionState } from "@/lib/companion/types";
import { liveError } from "./errors";

export const runtime = "nodejs";

const MAX_BODY = 300_000;

export async function GET() {
  const ready = await liveReady();
  if (!ready) return NextResponse.json({ ready: false, mine: null });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = user ? await myOpenGame(user.id) : null;
  return NextResponse.json({ ready: true, mine });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated", message: "Sign in to share a game." }, { status: 401 });
  if (!(await isProUser(user.id))) return NextResponse.json({ error: "pro_required", message: "Play together is part of GS Pro." }, { status: 402 });

  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "too_big", message: "That game is too big to share." }, { status: 413 });
  let body: { state?: SessionState; mode?: string };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  if (!body.state) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await createLiveGame({ userId: user.id, state: body.state, mode: body.mode });
  if (!result.ok) return liveError(result.error, result.message);
  return NextResponse.json({ view: result.value });
}
