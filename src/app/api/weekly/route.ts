/**
 * The Weekly Challenge.
 *   GET  → { ready, current, last, signedIn }: this week's Tier War (and your
 *          ranking if you've sent one) plus last week's revealed results. Also
 *          reveals last week if nobody has yet (see revealDue).
 *   POST { ballot } → save or change your ranking for this week (signed in).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addWeeks, revealAt, weekNumber, weekOf } from "@/lib/originals/weekly";
import { WeeklyNotReady, agendaCard, countEntries, ensureWeek, getEntry, getWeek, leaderboard, revealDue, saveBallot } from "@/lib/weekly/store";

export const runtime = "nodejs";

async function viewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await viewer();
  try {
    await revealDue().catch((err) => console.error("[weekly] reveal failed:", err));
    const thisWeek = weekOf();
    const week = await ensureWeek(thisWeek);
    const agenda = agendaCard(week.agenda_card_id);
    const mine = userId ? await getEntry(thisWeek, userId) : null;
    const lastWeek = addWeeks(thisWeek, -1);
    const last = await getWeek(lastWeek);
    const lastMine = userId && last?.status === "revealed" ? await getEntry(lastWeek, userId) : null;
    return NextResponse.json({
      ok: true,
      ready: true,
      signedIn: !!userId,
      current: {
        week: thisWeek,
        number: weekNumber(thisWeek),
        title: week.title,
        items: week.items,
        agenda: agenda ? { title: agenda.title, text: agenda.text } : null,
        players: await countEntries(thisWeek),
        revealAt: revealAt(thisWeek),
        myBallot: mine?.ballot ?? null,
      },
      last: last?.status === "revealed" ? {
        week: lastWeek,
        number: weekNumber(lastWeek),
        title: last.title,
        items: last.items,
        crowd: last.crowd ?? {},
        players: last.players,
        board: await leaderboard(lastWeek, 25),
        me: lastMine ? { rank: lastMine.rank, total: lastMine.total, tierScore: lastMine.tier_score, agendaPoints: lastMine.agenda_points, ballot: lastMine.ballot } : null,
      } : null,
    });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: true, ready: false, signedIn: !!userId });
    console.error("[weekly] read failed:", err);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ballot?: unknown } | null;
  try {
    const r = await saveBallot(userId, body?.ballot);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, ballot: r.ballot, players: await countEntries(weekOf()) });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    console.error("[weekly] save failed:", err);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
