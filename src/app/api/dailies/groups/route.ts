import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupStreaksFor } from "@/lib/daily/groupStreaks";
import { isGroupGame } from "@/lib/daily/groupRules";

/**
 * GET /api/dailies/groups?game=shuffle|dex → { groups }: your crews' streaks and
 * your people's streak on that daily (src/lib/daily/groupRules.ts). Signed in
 * only (an empty list otherwise). Counts only, never names.
 */
export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game");
  if (!isGroupGame(game)) return NextResponse.json({ groups: [] }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ groups: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const groups = await groupStreaksFor(user.id, game).catch(() => []);
  return NextResponse.json({ groups }, { headers: { "Cache-Control": "private, no-store" } });
}
