/**
 * The dailies together inside the Discord Activity (Bearer session): the
 * player's Discord identity, plus the account it signs in to (the Weekly
 * needs that account).
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { dailiesView } from "@/lib/daily/dailies";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ signedIn: true, entries: await dailiesView({ identityId: s.iid, userId: s.uid }, { fire: false }) }, { headers: { "Cache-Control": "private, no-store" } });
}
