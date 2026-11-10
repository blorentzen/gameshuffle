import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { askForSpace } from "@/lib/games/requests";

/**
 * POST /api/games/ask { game }: "Don't see your game?" on /games (spaces first wave, 2026-11-09). Signed in; one ask
 * per account per game; the word filter; 10 asks an hour per account and 30 per network. A game whose space is open
 * answers with the space instead of counting an ask.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const [mine, net] = await Promise.all([
    rateLimit(`space-ask:u:${user.id}`, { max: 10, windowMs: 3_600_000 }),
    rateLimit(`space-ask:ip:${ip}`, { max: 30, windowMs: 3_600_000 }),
  ]);
  if (!mine.ok || !net.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { game?: unknown } | null;
  if (typeof body?.game !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const r = await askForSpace(user.id, body.game);
  if (!r.ok) {
    const status = r.error === "not_ready" ? 503 : r.error === "failed" ? 500 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json(r);
}
