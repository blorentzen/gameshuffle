/**
 * The Weekly Challenge inside the Discord Activity (Bearer session). Same
 * answers as /api/weekly. Plays count on the GameShuffle account that signs in
 * with this Discord user (weekly_entries is keyed by account); without one,
 * `signedIn` is false and the page offers to sign in on gameshuffle.co.
 */

import { NextResponse, after } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { accountForDiscord } from "@/lib/daily/results";
import { noteAnswer, weekTopic } from "@/lib/discord/promptPosts";
import { weekOf } from "@/lib/originals/weekly";
import { WeeklyNotReady, ensureWeek } from "@/lib/weekly/store";
import { saveWeeklyPlay, weeklyView } from "@/lib/weekly/view";

export const runtime = "nodejs";

/** The session's account, looked up again so signing in mid-session counts without relaunching. */
async function accountOf(req: Request): Promise<{ ok: false } | { ok: true; userId: string | null }> {
  const s = sessionFrom(req);
  if (!s) return { ok: false };
  return { ok: true, userId: s.uid ?? (await accountForDiscord(s.did).catch(() => null)) };
}

export async function GET(req: Request) {
  const a = await accountOf(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ready: true, signedIn: !!a.userId, ...(await weeklyView(a.userId)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: true, ready: false, signedIn: !!a.userId });
    console.error("[activity/weekly] read failed:", err);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const a = await accountOf(req);
  if (!a.ok || !a.userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ballot?: unknown; answer?: unknown; predictions?: unknown } | null;
  try {
    const r = await saveWeeklyPlay(a.userId, body);
    // Played from a server channel: show it on that server's Weekly posts.
    const s = sessionFrom(req);
    if (r.ok && s?.gid) {
      const userId = a.userId;
      after(async () => noteAnswer({ guildId: s.gid, topic: await weekTopic(await ensureWeek(weekOf())), person: `u:${userId}`, name: s.name }));
    }
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    console.error("[activity/weekly] save failed:", err);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
