/**
 * The Weekly Challenge.
 *   GET  → { ready, current, last, signedIn }: this week's Tier War (and your
 *          ranking if you've sent one) plus last week's revealed results. Also
 *          reveals last week if nobody has yet (see revealDue).
 *   GET ?preview=next (staff) → next week as players will see it, without
 *          creating it or claiming its question. Read only.
 *   POST { ballot } → save or change your ranking for this week (signed in).
 *   POST { answer, predictions } → survey weeks: your own answer and your three
 *        guesses at the crowd's top answers (signed in; changeable until Monday).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addWeeks, revealAt, weekNumber, weekOf } from "@/lib/originals/weekly";
import { WeeklyNotReady, agendaCard, previewWeek } from "@/lib/weekly/store";
import { saveWeeklyPlay, weeklyView } from "@/lib/weekly/view";
import { isStaffRequest } from "@/lib/auth/raw";

export const runtime = "nodejs";

async function viewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await viewer();
  try {
    if (new URL(request.url).searchParams.get("preview") === "next" && await isStaffRequest()) {
      const next = addWeeks(weekOf(), 1);
      const week = await previewWeek(next);
      const agenda = agendaCard(week.agenda_card_id);
      return NextResponse.json({
        ok: true, ready: true, signedIn: true, preview: { saved: week.saved },
        current: {
          week: next, number: weekNumber(next), kind: week.kind ?? "tier", title: week.title, items: week.items,
          agenda: agenda ? { title: agenda.title, text: agenda.text } : null,
          players: 0, revealAt: revealAt(next), myBallot: null, myAnswer: null, myPredictions: null,
        },
        last: null,
      });
    }
    return NextResponse.json({ ok: true, ready: true, signedIn: !!userId, ...(await weeklyView(userId)) });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: true, ready: false, signedIn: !!userId });
    console.error("[weekly] read failed:", err);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ballot?: unknown; answer?: unknown; predictions?: unknown } | null;
  try {
    const r = await saveWeeklyPlay(userId, body);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    console.error("[weekly] save failed:", err);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
