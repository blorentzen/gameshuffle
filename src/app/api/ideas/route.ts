/** POST /api/ideas — submit a new idea (auth + Turnstile + 24h cap), optionally for one game (a catalog game, `game`). */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createIdea } from "@/lib/ideas/store";
import { IDEA_CATEGORIES, type IdeaCategory } from "@/lib/ideas/constants";
import { gameKey } from "@/lib/games/key";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    body?: string;
    category?: string;
    game?: string | null;
    turnstileToken?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const ok = await verifyTurnstileToken(
    body.turnstileToken,
    req.headers.get("x-forwarded-for") ?? undefined,
  );
  if (!ok) return NextResponse.json({ error: "captcha" }, { status: 400 });

  const category = body.category as IdeaCategory;
  if (!IDEA_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "bad_category" }, { status: 400 });
  }

  // A game the catalog knows, by its key; anything else is refused rather than saved as free text.
  const game = typeof body.game === "string" && body.game.trim() ? gameKey(body.game) : null;
  if (typeof body.game === "string" && body.game.trim() && !game) {
    return NextResponse.json({ error: "bad_game" }, { status: 400 });
  }

  const res = await createIdea({
    authorId: user.id,
    title: body.title ?? "",
    body: body.body ?? "",
    category,
    game,
  });
  if (!res.ok) {
    const status = res.reason === "rate_limited" ? 429 : res.reason === "restricted" ? 403 : 400;
    return NextResponse.json({ error: res.reason }, { status });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
