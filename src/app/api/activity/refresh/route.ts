/**
 * POST /api/activity/refresh  (Bearer session)
 *
 * After a player taps "Sign up free" in the Discord Activity they finish on
 * gameshuffle.co in their browser; the Activity asks here every few seconds
 * whether a GameShuffle account now signs in with their Discord user. When
 * one does, it gets a fresh session naming that account, so the Weekly and
 * the profile streak work without relaunching.
 */

import { NextResponse } from "next/server";
import { sessionFrom, signSession } from "@/lib/activity/session";
import { accountForDiscord } from "@/lib/daily/results";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const uid = s.uid ?? (await accountForDiscord(s.did).catch(() => null));
  if (!uid) return NextResponse.json({ ok: true, linked: false }, { headers: { "Cache-Control": "no-store" } });
  const session = s.uid ? null : signSession({ did: s.did, iid: s.iid, uid, name: s.name, avatar: s.avatar });
  return NextResponse.json({ ok: true, linked: true, session }, { headers: { "Cache-Control": "no-store" } });
}
