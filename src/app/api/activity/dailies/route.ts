/**
 * The dailies together inside the Discord Activity (Bearer session): the
 * player's Discord identity, plus the account it signs in to (the Weekly
 * needs that account). `picks`: that account's dailies, so the bar follows
 * them here too (choosing happens on the site, so `canChoose` is false).
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { dailiesView } from "@/lib/daily/dailies";
import { dailyPicksState } from "@/lib/originals/dailyPicks";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [entries, picks] = await Promise.all([
    dailiesView({ identityId: s.iid, userId: s.uid }, { fire: false, duel: false }),
    dailyPicksState(s.uid ?? null).catch(() => null),
  ]);
  return NextResponse.json({ signedIn: true, entries, picks: picks ? { ...picks, canChoose: false } : null }, { headers: { "Cache-Control": "private, no-store" } });
}
